// js/app.js  (GitHub Pages safe)
// ─────────────────────────────────────────────────────────
// Key fixes vs v2:
//   1. App never stays display:none. If Supabase is unconfigured,
//      we show the app in offline/demo mode immediately.
//   2. Auth check is wrapped in try/catch — a throw never locks the UI.
//   3. All event listeners use addEventListener, never onclick= attributes
//      on elements created by innerHTML (those don't fire on GH Pages CSP).
// ─────────────────────────────────────────────────────────

const App = {
  state: {
    currentScreen: 'today',
    inboxFilter:   'all',
    editingTaskId: null,
    calMonth:      new Date().getMonth(),
    calYear:       new Date().getFullYear(),
    selectedDate:  null,
    aiParsed:      null,
    _taskGTD:      'inbox',
    _taskEnergy:   'med',
    _detailTaskId: null,
    isConfigured:  false,   // true once Supabase creds are set
  },

  // ── Init ──────────────────────────────────────────────
  async init() {
    // Always restore theme immediately from localStorage
    const savedTheme = localStorage.getItem('nudget_theme') || '';
    document.documentElement.setAttribute('data-theme', savedTheme);

    App._initStars();

    // Check if Supabase is actually configured
    const configured = (
      typeof CONFIG !== 'undefined' &&
      CONFIG.SUPABASE_URL &&
      !CONFIG.SUPABASE_URL.includes('YOUR_PROJECT')
    );
    App.state.isConfigured = configured;

    if (!configured) {
      // No Supabase — show app in local-only mode immediately
      console.info('nudget: Supabase not configured, running in local mode');
      App._showAppShell();
      await App._bootLocalMode();
      return;
    }

    // Supabase is configured — check session
    try {
      Auth.onAuthChange(async session => {
        if (session) {
          await App.boot(session);
        } else {
          App._showAppShell();
          AuthUI.show();
        }
      });

      const session = await Auth.getSession();
      if (!session) {
        App._showAppShell();
        AuthUI.show();
      }
    } catch (err) {
      console.error('nudget: auth check failed, falling back to local mode', err);
      App._showAppShell();
      await App._bootLocalMode();
    }
  },

  _showAppShell() {
    document.getElementById('app').style.display  = 'flex';
    document.getElementById('fab').style.display  = 'flex';
  },

  // Boot with a full Supabase session
  async boot(session) {
    AuthUI.hide();
    App._showAppShell();

    try {
      Store.user = await DB.getProfile();
      if (Store.user?.name)  CONFIG.USER_NAME = Store.user.name;
      if (Store.user?.theme) {
        document.documentElement.setAttribute('data-theme', Store.user.theme);
        localStorage.setItem('nudget_theme', Store.user.theme);
      }
      await Sync.init(session.user.id);
      await Store.loadAll();
      Store.completionHistory = await DB.getCompletionHistory().catch(() => []);
    } catch (err) {
      console.error('nudget: boot error', err);
      // Still wire the UI — partial data is better than nothing
    }

    App._wireAll();
    LocalNotifications.requestPermission();
    LocalNotifications.start();
    App._loadBriefing();
    Render.screen('today');
  },

  // Boot without Supabase — purely local, no auth screen
  async _bootLocalMode() {
    // Load whatever is in the IndexedDB cache (may be empty first run)
    try { await Store.loadAll(); } catch { /* empty cache is fine */ }

    App._wireAll();
    LocalNotifications.start();
    Render.screen('today');
    App.toast('running in local mode');
  },

  // ── Wire all UI (called once per boot) ───────────────
  _wireAll() {
    App._initNav();
    App._initFab();
    App._initTopBar();
    App._initTaskSheet();
    App._initHabitSheet();
    App._initEventSheet();
    App._initAreaSheet();
    App._initAiCapture();
    App._initCalendar();
    App._initScratch();
    App._initStateFilter();
    App._initDetailOverlay();
    App._initThemePicker();
    App._initSheetCloseButtons();
    App._initSyncListener();
  },

  // ── Sync listener ─────────────────────────────────────
  _initSyncListener() {
    window.addEventListener('nudget:sync', async e => {
      const { table } = e.detail;
      if (table === 'all') await Store.loadAll();
      else await Store.reloadTable(table);
      Render.screen(App.state.currentScreen);
    });
  },

  // ── Navigation ────────────────────────────────────────
  _initNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => App.navigate(btn.dataset.screen));
    });
  },

  navigate(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('screen-' + screen)?.classList.add('active');
    document.querySelector(`.nav-item[data-screen="${screen}"]`)?.classList.add('active');
    App.state.currentScreen = screen;
    Render.screen(screen);
  },

  // ── FAB ───────────────────────────────────────────────
  _initFab() {
    document.getElementById('fab').addEventListener('click', () => {
      const s = App.state.currentScreen;
      if (s === 'habits')   return App.openSheet('habit-overlay');
      if (s === 'calendar') return App.openSheet('event-overlay');
      App.openSheet('ai-overlay');
    });
  },

  // ── Top bar ───────────────────────────────────────────
  _initTopBar() {
    document.getElementById('btn-capture')?.addEventListener('click', () => App.openSheet('ai-overlay'));
    document.getElementById('btn-theme')?.addEventListener('click', () => App.openSheet('theme-overlay'));
    document.getElementById('btn-add-area')?.addEventListener('click', () => App.openSheet('area-overlay'));
    document.getElementById('btn-signout')?.addEventListener('click', async () => {
      if (!App.state.isConfigured) { App.toast('no account in local mode'); return; }
      if (!confirm('Sign out?')) return;
      await Auth.signOut();
    });
  },

  // ── Sheet helpers ─────────────────────────────────────
  openSheet(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  },
  closeSheet(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  },

  // IMPORTANT: use addEventListener, not onclick attributes, for GH Pages CSP
  _initSheetCloseButtons() {
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => App.closeSheet(btn.dataset.close));
    });
    // Click backdrop to close
    document.querySelectorAll('.overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        // Only close if the click landed directly on the backdrop, not the sheet
        if (e.target === overlay) App.closeSheet(overlay.id);
      });
    });
  },

  // ── AI capture ────────────────────────────────────────
  _initAiCapture() {
    const msgs    = document.getElementById('ai-messages');
    const input   = document.getElementById('aiInput');
    const sendBtn = document.getElementById('btn-ai-send');
    if (!msgs || !input || !sendBtn) return;

    document.getElementById('btn-capture')?.addEventListener('click', () => {
      msgs.innerHTML = `<div class="ai-msg ai">Hey! Tell me what's on your mind &mdash; I'll handle the structure.</div>`;
      document.getElementById('aiParsed').style.display = 'none';
      const errEl = document.getElementById('ai-error');
      if (errEl) errEl.style.display = 'none';
      input.value = '';
      setTimeout(() => input.focus(), 300);
    });

    const send = async () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendBtn.disabled = true;
      msgs.innerHTML += `<div class="ai-msg user">${text}</div>`;
      msgs.innerHTML += `<div class="ai-msg loading" id="ai-loading">parsing...</div>`;
      msgs.scrollTop = msgs.scrollHeight;

      try {
        const parsed = await AI.parseTask(text);
        document.getElementById('ai-loading')?.remove();
        msgs.innerHTML += `<div class="ai-msg ai">Got it. Here's what I picked up:</div>`;
        msgs.scrollTop = msgs.scrollHeight;
        App.state.aiParsed = parsed;
        document.getElementById('aiParsedContent').innerHTML = `
          <div class="ai-parsed-item"><span class="ai-parsed-key">TITLE &rsaquo;</span> ${parsed.title}</div>
          <div class="ai-parsed-item"><span class="ai-parsed-key">STATE &rsaquo;</span> ${parsed.gtdState}</div>
          <div class="ai-parsed-item"><span class="ai-parsed-key">ENERGY &rsaquo;</span> ${parsed.energy}</div>
          ${parsed.dueDate   ? `<div class="ai-parsed-item"><span class="ai-parsed-key">DUE &rsaquo;</span> ${parsed.dueDate}</div>` : ''}
          ${parsed.freqDays  ? `<div class="ai-parsed-item"><span class="ai-parsed-key">FREQUENCY &rsaquo;</span> every ${parsed.freqDays} days</div>` : ''}
          ${parsed.subtasks?.length ? `<div class="ai-parsed-item"><span class="ai-parsed-key">SUBTASKS &rsaquo;</span> ${parsed.subtasks.join(' &middot; ')}</div>` : ''}
        `;
        document.getElementById('aiParsed').style.display = 'block';
      } catch (err) {
        document.getElementById('ai-loading')?.remove();
        const errEl = document.getElementById('ai-error');
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      }
      sendBtn.disabled = false;
    };

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

    document.getElementById('btn-confirm-ai')?.addEventListener('click', async () => {
      const p = App.state.aiParsed;
      if (!p) return;
      const today = new Date().toISOString().split('T')[0];
      await Store.addTask({
        title:          p.title,
        gtd_state:      p.gtdState || 'inbox',
        energy:         p.energy   || 'med',
        due_date:       p.dueDate === 'today' ? today : (p.dueDate || null),
        freq_days:      p.freqDays || null,
        recurrence:     p.recurrence || null,
        progress_type:  p.progressType || 'binary',
        progress_target: p.progressTarget || null,
        progress_unit:  p.progressUnit || null,
        progress_val:   0,
        subtasks:       (p.subtasks || []).map(s => ({ text: s, done: false })),
        notes:          p.notes || '',
      });
      App.toast('task added!');
      App.closeSheet('ai-overlay');
      Render.screen(App.state.currentScreen);
    });

    document.getElementById('btn-edit-ai')?.addEventListener('click', () => {
      const p = App.state.aiParsed;
      App.closeSheet('ai-overlay');
      setTimeout(() => App.openTaskSheet(null, p), 200);
    });
  },

  async _loadBriefing() {
    try {
      const tasks = Store.getTodayTasks();
      if (!tasks.length) return;
      const titles = await AI.generateBriefing(tasks);
      if (!titles.length) return;
      const card = document.getElementById('ai-briefing-card');
      const list = document.getElementById('ai-briefing-list');
      if (!card || !list) return;
      list.innerHTML = titles.map((t, i) =>
        `<div class="ai-suggest-item"><span class="ai-rank">${i+1}.</span> ${t}</div>`
      ).join('');
      card.style.display = 'block';
    } catch { /* non-critical */ }
  },

  // ── Task sheet ────────────────────────────────────────
  openTaskSheet(editId, prefill) {
    App.state.editingTaskId = editId || null;
    const t = editId ? Store.getTask(editId) : null;
    const titleEl = document.getElementById('task-title');
    if (titleEl) {
      document.getElementById('task-sheet-title').textContent = t ? 'EDIT TASK' : 'ADD TASK';
      titleEl.value = t?.title || prefill?.title || '';
      document.getElementById('task-due').value   = t?.due_date || prefill?.dueDate || '';
      document.getElementById('task-notes').value = t?.notes    || '';
      document.getElementById('task-recur').value = t?.recurrence || '';
      document.getElementById('freq-days').value  = t?.freq_days  || prefill?.freqDays || '';
      document.getElementById('freq-days-wrap').style.display = 'none';
    }
    const gs = t?.gtd_state || prefill?.gtdState || 'inbox';
    const en = t?.energy    || prefill?.energy   || 'med';
    document.querySelectorAll('#gtdStateSelector .state-option').forEach(b => b.classList.toggle('selected', b.dataset.s === gs));
    document.querySelectorAll('#energySelector .energy-option').forEach(b => b.classList.toggle('selected', b.dataset.e === en));
    App.state._taskGTD    = gs;
    App.state._taskEnergy = en;

    const pType = t?.progress_type || prefill?.progressType || 'binary';
    document.getElementById('progress-type').value = pType;
    document.getElementById('progress-numeric-wrap').style.display = pType === 'numeric' ? 'flex' : 'none';
    document.getElementById('progress-target').value = t?.progress_target || '';
    document.getElementById('progress-unit').value   = t?.progress_unit   || '';

    Store.populateProjectSelect(document.getElementById('task-project'));
    const projId = t?.task_projects?.[0]?.project_id || '';
    document.getElementById('task-project').value = projId;

    App.openSheet('task-overlay');
  },

  _initTaskSheet() {
    document.querySelectorAll('#gtdStateSelector .state-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#gtdStateSelector .state-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        App.state._taskGTD = btn.dataset.s;
      });
    });
    document.querySelectorAll('#energySelector .energy-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#energySelector .energy-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        App.state._taskEnergy = btn.dataset.e;
      });
    });
    document.getElementById('progress-type')?.addEventListener('change', function() {
      document.getElementById('progress-numeric-wrap').style.display = this.value === 'numeric' ? 'flex' : 'none';
    });
    document.getElementById('task-recur')?.addEventListener('change', function() {
      document.getElementById('freq-days-wrap').style.display = this.value === '__freq__' ? 'block' : 'none';
    });
    document.getElementById('btn-save-task')?.addEventListener('click', async () => {
      const title = document.getElementById('task-title').value.trim();
      if (!title) { App.toast('please add a title'); return; }
      const recurVal  = document.getElementById('task-recur').value;
      const isFreq    = recurVal === '__freq__';
      const pType     = document.getElementById('progress-type').value;
      const projectId = document.getElementById('task-project').value || null;
      const taskData  = {
        title,
        gtd_state:       App.state._taskGTD,
        energy:          App.state._taskEnergy,
        due_date:        document.getElementById('task-due').value || null,
        notes:           document.getElementById('task-notes').value,
        recurrence:      isFreq ? null : (recurVal || null),
        freq_days:       isFreq ? (parseInt(document.getElementById('freq-days').value) || null) : null,
        progress_type:   pType,
        progress_target: pType === 'numeric' ? (parseInt(document.getElementById('progress-target').value) || null) : null,
        progress_unit:   pType === 'numeric' ? (document.getElementById('progress-unit').value || null) : null,
        progress_val:    0,
        projectIds:      projectId ? [projectId] : [],
        subtasks:        [],
      };
      if (App.state.editingTaskId) {
        await Store.updateTask(App.state.editingTaskId, taskData);
        App.toast('task updated!');
      } else {
        await Store.addTask(taskData);
        App.toast('task added!');
      }
      App.closeSheet('task-overlay');
      Render.screen(App.state.currentScreen);
    });
  },

  // ── Habit sheet ───────────────────────────────────────
  _initHabitSheet() {
    document.getElementById('habit-icon')?.addEventListener('input', function() {
      const preview = document.getElementById('habit-icon-preview');
      if (!preview) return;
      if (this.value) {
        preview.innerHTML = `<img src="assets/icons/habits/${this.value}" style="width:100%;height:100%;object-fit:contain;" onerror="this.parentElement.textContent='?'" />`;
      } else { preview.textContent = '?'; }
    });
    document.getElementById('btn-save-habit')?.addEventListener('click', async () => {
      const name = document.getElementById('habit-name').value.trim();
      if (!name) { App.toast('please add a name'); return; }
      await Store.addHabit({
        name,
        icon_file:       document.getElementById('habit-icon').value.trim() || null,
        progress_target: parseInt(document.getElementById('habit-target').value) || null,
        progress_unit:   document.getElementById('habit-unit').value || null,
        recurrence:      document.getElementById('habit-recur').value,
        streak: 0,
      });
      App.toast('habit added!');
      App.closeSheet('habit-overlay');
      Render.habits();
    });
  },

  // ── Event sheet ───────────────────────────────────────
  _initEventSheet() {
    const dateEl = document.getElementById('event-date');
    if (dateEl) dateEl.valueAsDate = new Date();
    document.getElementById('btn-save-event')?.addEventListener('click', async () => {
      const name = document.getElementById('event-name').value.trim();
      if (!name) { App.toast('please add a name'); return; }
      await Store.addEvent({
        name,
        event_date:           document.getElementById('event-date').value,
        type:                 document.getElementById('event-type').value,
        reminder_offset_days: parseInt(document.getElementById('event-offset').value) || 7,
        notes:                document.getElementById('event-notes').value,
      });
      App.toast('event added!');
      App.closeSheet('event-overlay');
      Render.screen(App.state.currentScreen);
    });
  },

  // ── Area sheet ────────────────────────────────────────
  _initAreaSheet() {
    document.getElementById('btn-save-area')?.addEventListener('click', async () => {
      const areaName = document.getElementById('area-name').value.trim();
      const projName = document.getElementById('area-project').value.trim();
      if (!areaName) { App.toast('please add an area name'); return; }
      const area = await Store.addArea(areaName);
      if (projName && area?.id) await Store.addProject(area.id, projName);
      App.toast('area added!');
      App.closeSheet('area-overlay');
      Render.projects();
    });
  },

  // ── State filter ──────────────────────────────────────
  _initStateFilter() {
    document.querySelectorAll('.state-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.state-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        App.state.inboxFilter = btn.dataset.state;
        Render.inbox(App.state.inboxFilter);
      });
    });
  },

  // ── Calendar ──────────────────────────────────────────
  _initCalendar() {
    document.getElementById('cal-prev')?.addEventListener('click', () => {
      App.state.calMonth--;
      if (App.state.calMonth < 0) { App.state.calMonth = 11; App.state.calYear--; }
      App.state.selectedDate = null;
      Render.calendar();
    });
    document.getElementById('cal-next')?.addEventListener('click', () => {
      App.state.calMonth++;
      if (App.state.calMonth > 11) { App.state.calMonth = 0; App.state.calYear++; }
      App.state.selectedDate = null;
      Render.calendar();
    });
  },

  // ── Scratch ───────────────────────────────────────────
  _initScratch() {
    const input  = document.getElementById('scratchInput');
    const addBtn = document.getElementById('btn-scratch-add');
    if (!input || !addBtn) return;
    const add = async () => {
      const text = input.value.trim();
      if (!text) return;
      await Store.addScratchItem(text);
      input.value = '';
      Render.scratch();
    };
    addBtn.addEventListener('click', add);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  },

  // ── Detail overlay ────────────────────────────────────
  _initDetailOverlay() {
    document.getElementById('btn-detail-back')?.addEventListener('click', () => App.closeDetail());
    document.getElementById('btn-detail-edit')?.addEventListener('click', () => {
      const id = App.state._detailTaskId;
      App.closeDetail();
      setTimeout(() => App.openTaskSheet(id), 200);
    });
  },

  openDetail(taskId) {
    App.state._detailTaskId = taskId;
    Render.taskDetail(taskId);
    document.getElementById('task-detail')?.classList.add('open');
  },

  closeDetail() {
    document.getElementById('task-detail')?.classList.remove('open');
    Render.screen(App.state.currentScreen);
  },

  viewProject(projectId) {
    const proj  = Store._projectMap?.[projectId];
    App.navigate('inbox');
    const tasks = Store.tasks.filter(t =>
      t.task_projects?.some(tp => tp.project_id === projectId)
    );
    const countEl = document.getElementById('inbox-count');
    if (countEl) countEl.textContent = tasks.length;
    const container = document.getElementById('inbox-tasks');
    if (!container) return;
    container.innerHTML = '';
    if (!tasks.length) container.appendChild(Render._emptyState('no tasks in this project yet'));
    else tasks.forEach(t => container.appendChild(Render._taskCard(t)));
    App.toast(proj?.name || 'project');
  },

  // ── Theme picker ──────────────────────────────────────
  _initThemePicker() {
    document.querySelectorAll('.theme-tile').forEach(tile => {
      tile.addEventListener('click', async () => {
        const theme = tile.dataset.theme;
        document.querySelectorAll('.theme-tile').forEach(t => t.classList.remove('active'));
        tile.classList.add('active');
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('nudget_theme', theme);
        try { if (App.state.isConfigured) await DB.updateProfile({ theme }); } catch { }
        App.toast('theme applied!');
        App.closeSheet('theme-overlay');
      });
    });
    const current = localStorage.getItem('nudget_theme') || '';
    document.querySelectorAll('.theme-tile').forEach(t => {
      t.classList.toggle('active', t.dataset.theme === current);
    });
  },

  // ── Stars ─────────────────────────────────────────────
  _initStars() {
    const sf    = document.getElementById('stars');
    if (!sf) return;
    const chars = ['\u2726','\u2605','\u25C6','\u25C7'];
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('div');
      s.className   = 'pstar';
      s.textContent = chars[Math.floor(Math.random() * chars.length)];
      s.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;` +
        `animation-duration:${6+Math.random()*9}s;` +
        `animation-delay:${Math.random()*10}s;` +
        `font-size:${6+Math.random()*6}px;`;
      sf.appendChild(s);
    }
  },

  // ── Toast ─────────────────────────────────────────────
  _toastTimer: null,
  toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = '\u2726 ' + msg;
    el.classList.add('show');
    clearTimeout(App._toastTimer);
    App._toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());