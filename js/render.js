/* ═══════════════════════════════════════════════════
   NUDGET — RENDER MODULE
   All DOM-building functions. Pure — reads from Store,
   writes to DOM, never modifies state directly.
═══════════════════════════════════════════════════ */

const Render = {

  /* ── Dispatch to correct render based on screen name ── */
  screen(name) {
    const map = {
      today:    () => Render.today(),
      inbox:    () => Render.inbox(),
      habits:   () => Render.habits(),
      projects: () => Render.projects(),
      calendar: () => Render.calendar(),
      scratch:  () => Render.scratch(),
      dash:     () => Render.dashboard(),
    };
    map[name]?.();
  },

  /* ════════════════════════════════════════════════
     TODAY
  ════════════════════════════════════════════════ */
  today() {
    const tasks   = Store.getTodayTasks();
    const nudges  = Store.getOverdueFreqTasks();
    const events  = Store.getUpcomingEvents(7);

    /* morning greeting */
    const name = (typeof CONFIG !== 'undefined' && CONFIG.USER_NAME) ? CONFIG.USER_NAME : '';
    document.querySelector('.morning-greeting').textContent =
      name ? `GOOD MORNING, ${name.toUpperCase()} \u2726` : 'GOOD MORNING \u2726';

    /* stats */
    document.getElementById('stat-today').textContent  = tasks.length;
    document.getElementById('stat-habits').textContent = Store.state.habits.length;
    document.getElementById('stat-events').textContent = events.length;
    document.getElementById('today-task-count').textContent = tasks.length;

    /* nudges */
    const nudgeContainer = document.getElementById('nudge-container');
    nudgeContainer.innerHTML = '';
    nudges.slice(0, 3).forEach(t => {
      const now = Date.now();
      const last = t.lastCompletedAt || t.createdAt || 0;
      const daysSince = Math.round((now - last) / 86400000);
      const bar = document.createElement('div');
      bar.className = 'nudge-bar';
      bar.innerHTML = `
        <div class="nudge-icon-img">
          <img src="assets/icons/nudge-icon.png" alt="" onerror="this.style.display='none'" />
        </div>
        <div class="nudge-text">${t.title} &mdash; ${daysSince} days since last done.</div>
        <button class="nudge-action" data-task-id="${t.id}">SCHEDULE</button>
      `;
      bar.querySelector('.nudge-action').addEventListener('click', () => {
        App.openTaskSheet(t.id);
      });
      nudgeContainer.appendChild(bar);
    });

    /* today tasks */
    const container = document.getElementById('today-tasks');
    container.innerHTML = '';
    if (!tasks.length) {
      container.appendChild(Render._emptyState('nothing in next actions.\nadd something via +'));
    } else {
      tasks.forEach(t => container.appendChild(Render._taskCard(t)));
    }

    /* upcoming events */
    const evContainer = document.getElementById('today-events');
    evContainer.innerHTML = '';
    if (!events.length) {
      evContainer.appendChild(Render._emptyState('no upcoming events'));
    } else {
      events.slice(0, 5).forEach(e => {
        const chip = Render._eventChip(e);
        evContainer.appendChild(chip);
      });
    }
  },

  /* ════════════════════════════════════════════════
     INBOX
  ════════════════════════════════════════════════ */
  inbox(filter) {
    filter = filter || App.state.inboxFilter || 'all';
    const tasks = filter === 'all'
      ? Store.state.tasks
      : Store.state.tasks.filter(t => t.gtdState === filter);

    document.getElementById('inbox-count').textContent = tasks.length;
    const container = document.getElementById('inbox-tasks');
    container.innerHTML = '';

    if (!tasks.length) {
      container.appendChild(Render._emptyState('nothing here.\nadd a task via +'));
      return;
    }
    tasks.forEach(t => container.appendChild(Render._taskCard(t)));
  },

  /* ════════════════════════════════════════════════
     HABITS
  ════════════════════════════════════════════════ */
  habits() {
    const habits = Store.state.habits;
    document.getElementById('habit-screen-count').textContent = habits.length;

    const list = document.getElementById('habit-list');
    list.innerHTML = '';

    if (!habits.length) {
      list.appendChild(Render._emptyState('no habits yet.\ntap + to add one'));
    } else {
      habits.forEach(h => {
        /* main row */
        const row = document.createElement('div');
        row.className = 'habit-row';
        const cells = h.log.map((val, i) => {
          const isToday = i === 6;
          let cls = '';
          if (val) cls = 'done';
          else if (!isToday && val === 0) cls = 'missed';
          else if (val === null || val === undefined) cls = '';
          return `<div class="habit-cell ${cls} ${isToday ? 'today-cell' : ''}" data-habit="${h.id}" data-day="${i}"></div>`;
        }).join('');

        const iconSrc = h.iconFile ? `assets/icons/habits/${h.iconFile}` : '';
        const iconHtml = iconSrc
          ? `<img class="habit-icon-img" src="${iconSrc}" alt="" onerror="this.style.display='none'" />`
          : `<div style="width:18px;height:18px;flex-shrink:0;"></div>`;

        const streakText = h.streak > 0 ? `${h.streak} day streak` : 'no streak yet';

        row.innerHTML = `
          <div class="habit-info">
            <div class="habit-icon-row">${iconHtml}<div class="habit-name">${h.name}</div></div>
            <div class="habit-streak">${streakText}</div>
          </div>
          <div class="habit-cells">${cells}</div>
        `;

        /* toggle on cell click */
        row.querySelectorAll('.habit-cell').forEach(cell => {
          cell.addEventListener('click', e => {
            e.stopPropagation();
            const dayIdx = parseInt(cell.dataset.day);
            const current = h.log[dayIdx];
            const newVal = current ? 0 : 1;
            Store.updateHabitLog(h.id, 6 - dayIdx, newVal);
            Render.habits();
          });
        });
        list.appendChild(row);

        /* numeric progress row */
        if (h.progressTarget) {
          const pRow = document.createElement('div');
          pRow.className = 'habit-progress-row';
          const todayVal = h.log[6] || 0;
          const pct = Math.round(Math.min(todayVal, h.progressTarget) / h.progressTarget * 100);
          pRow.innerHTML = `
            <div class="habit-progress-info">target: ${h.progressTarget} ${h.progressUnit || ''}</div>
            <div class="habit-progress-bar-wrap">
              <div class="progress-bar-bg" style="flex:1;">
                <div class="progress-bar-fill" style="width:${pct}%;"></div>
              </div>
              <span style="font-family:var(--font-vt);font-size:15px;color:var(--g1);">${todayVal}/${h.progressTarget}</span>
            </div>
          `;
          list.appendChild(pRow);
        }
      });
    }

    /* streak summary */
    const summary = document.getElementById('streak-summary');
    summary.innerHTML = '';
    habits.forEach(h => {
      const row = document.createElement('div');
      row.className = 'streak-row';
      const iconSrc = h.iconFile ? `assets/icons/habits/${h.iconFile}` : '';
      row.innerHTML = `
        <div class="streak-icon">${iconSrc ? `<img src="${iconSrc}" alt="" onerror="this.style.display='none'" />` : ''}</div>
        <div class="streak-name">${h.name}</div>
        <div class="streak-val ${h.streak > 0 ? '' : 'none'}">${h.streak > 0 ? h.streak + ' days' : '&mdash;'}</div>
      `;
      summary.appendChild(row);
    });
  },

  /* ════════════════════════════════════════════════
     PROJECTS
  ════════════════════════════════════════════════ */
  projects() {
    const container = document.getElementById('areas-list');
    container.innerHTML = '';
    const areas = Store.state.areas;

    if (!areas.length) {
      container.appendChild(Render._emptyState('no areas yet.\nuse + AREA to create one'));
      return;
    }

    areas.forEach(area => {
      const section = document.createElement('div');
      section.className = 'area-section';

      const projectsHtml = area.projects.map(pid => {
        const p = Store.state.projects[pid];
        if (!p) return '';
        const allTasks  = Store.state.tasks.filter(t => t.projectId === pid);
        const doneTasks = allTasks.filter(t => t.gtdState === 'done');
        const pct = allTasks.length ? Math.round(doneTasks.length / allTasks.length * 100) : 0;
        return `
          <div class="project-card" data-project-id="${pid}">
            <div class="project-name">${p.name}</div>
            <div class="project-meta">
              <div class="project-task-count">${allTasks.length} task${allTasks.length !== 1 ? 's' : ''}</div>
              <div style="flex:1;display:flex;align-items:center;gap:6px;min-width:0;">
                <div class="progress-bar-bg" style="flex:1;"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>
                <span style="font-family:var(--font-vt);font-size:14px;color:var(--text3);">${pct}%</span>
              </div>
            </div>
          </div>`;
      }).join('');

      section.innerHTML = `
        <div class="area-header">
          <div class="area-indicator" style="background:${area.color};"></div>
          <div class="area-name">${area.name}</div>
          <div class="area-count">${area.projects.length}</div>
          <div class="area-toggle open">&#9654;</div>
        </div>
        <div class="area-projects">${projectsHtml}</div>
      `;

      /* toggle collapse */
      section.querySelector('.area-header').addEventListener('click', () => {
        const toggle   = section.querySelector('.area-toggle');
        const projects = section.querySelector('.area-projects');
        const isOpen   = toggle.classList.contains('open');
        toggle.classList.toggle('open', !isOpen);
        projects.classList.toggle('collapsed', isOpen);
      });

      /* click project card → filter inbox to that project */
      section.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', () => {
          App.viewProject(card.dataset.projectId);
        });
      });

      container.appendChild(section);
    });
  },

  /* ════════════════════════════════════════════════
     CALENDAR
  ════════════════════════════════════════════════ */
  calendar() {
    const { calMonth: m, calYear: y } = App.state;
    const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    document.getElementById('cal-month-label').textContent = `${MONTHS[m]} ${y}`;

    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';

    /* day headers */
    ['M','T','W','T','F','S','S'].forEach(d => {
      const h = document.createElement('div');
      h.className = 'cal-day-header';
      h.textContent = d;
      grid.appendChild(h);
    });

    /* first day offset (Mon=0) */
    const first = new Date(y, m, 1);
    let startDay = first.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const prevDays   = new Date(y, m, 0).getDate();
    const daysInMonth= new Date(y, m+1, 0).getDate();
    const todayDate  = new Date();

    /* prev month overflow */
    for (let i = startDay - 1; i >= 0; i--) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell other-month';
      cell.innerHTML = `<div class="cal-date">${prevDays - i}</div>`;
      grid.appendChild(cell);
    }

    /* current month */
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = d === todayDate.getDate() && m === todayDate.getMonth() && y === todayDate.getFullYear();
      const isSelected = dateStr === App.state.selectedDate;

      const cell = document.createElement('div');
      cell.className = `cal-cell${isToday?' today':''}${isSelected?' selected':''}`;
      cell.dataset.date = dateStr;

      const hasTasks  = Store.state.tasks.some(t => t.dueDate === dateStr);
      const hasEvents = Store.state.events.some(e => e.date === dateStr);
      const hasDone   = Store.state.tasks.some(t => t.dueDate === dateStr && t.gtdState === 'done');

      cell.innerHTML = `
        <div class="cal-date">${d}</div>
        <div class="cal-dots">
          ${hasTasks  ? '<div class="cal-dot task"></div>'  : ''}
          ${hasEvents ? '<div class="cal-dot event"></div>' : ''}
          ${hasDone   ? '<div class="cal-dot habit"></div>' : ''}
        </div>`;

      cell.addEventListener('click', () => {
        App.state.selectedDate = dateStr;
        Render.calendar();
        Render.calDay(dateStr);
      });
      grid.appendChild(cell);
    }

    /* show today or selected day */
    const showDate = App.state.selectedDate ||
      `${y}-${String(m+1).padStart(2,'0')}-${String(todayDate.getDate()).padStart(2,'0')}`;
    Render.calDay(showDate);
  },

  calDay(dateStr) {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = new Date(dateStr + 'T00:00:00');
    document.getElementById('cal-day-title').textContent =
      `${MONTHS[d.getMonth()]} ${d.getDate()} \u2014 ${d.getFullYear()}`;

    const container = document.getElementById('cal-day-events');
    container.innerHTML = '';

    const dayTasks  = Store.state.tasks.filter(t => t.dueDate === dateStr);
    const dayEvents = Store.state.events.filter(e => e.date === dateStr);

    if (!dayTasks.length && !dayEvents.length) {
      container.innerHTML = `<div style="font-family:var(--font-vt);font-size:17px;color:var(--text3);padding:10px 0;">nothing scheduled.</div>`;
      return;
    }
    dayEvents.forEach(e => {
      container.innerHTML += `
        <div class="cal-event-item">
          <div class="cal-event-dot" style="background:var(--a1);"></div>
          <div>
            <div class="cal-event-name">${e.name}</div>
            <div class="cal-event-sub">${e.type} &middot; reminder ${e.reminderOffset}d before</div>
          </div>
        </div>`;
    });
    dayTasks.forEach(t => {
      container.innerHTML += `
        <div class="cal-event-item">
          <div class="cal-event-dot" style="background:var(--p1);"></div>
          <div>
            <div class="cal-event-name">${t.title}</div>
            <div class="cal-event-sub">${t.gtdState} &middot; ${t.energy} energy</div>
          </div>
        </div>`;
    });
  },

  /* ════════════════════════════════════════════════
     SCRATCH
  ════════════════════════════════════════════════ */
  scratch() {
    const today = new Date();
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('scratch-date-label').textContent =
      `TODAY \u2014 ${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;

    const todayStr = today.toISOString().split('T')[0];
    const items = Store.state.scratchItems.filter(x => x.date === todayStr || !x.date);

    const list = document.getElementById('scratch-list');
    list.innerHTML = '';

    if (!items.length) {
      list.appendChild(Render._emptyState('no quick tasks today.\ntype one above'));
    } else {
      items.forEach(item => {
        const el = document.createElement('div');
        el.className = `scratch-item${item.done ? ' done' : ''}`;
        el.innerHTML = `
          <div class="scratch-checkbox${item.done ? ' checked' : ''}" data-id="${item.id}"></div>
          <span class="scratch-text">${item.text}</span>
          <button class="scratch-delete" data-id="${item.id}">&times;</button>
        `;
        el.querySelector('.scratch-checkbox').addEventListener('click', e => {
          e.stopPropagation();
          Store.toggleScratch(item.id);
          Render.scratch();
        });
        el.querySelector('.scratch-delete').addEventListener('click', e => {
          e.stopPropagation();
          Store.deleteScratch(item.id);
          Render.scratch();
        });
        list.appendChild(el);
      });
    }

    /* past logs */
    const logContainer = document.getElementById('scratch-log-list');
    logContainer.innerHTML = Store.state.scratchLogs.map(l => `
      <div class="scratch-log">
        <div class="scratch-log-date">${l.date}</div>
        <div class="scratch-log-text">${l.count} task${l.count !== 1 ? 's' : ''} done \u2726</div>
      </div>
    `).join('') || `<div style="padding:12px;font-family:var(--font-vt);font-size:16px;color:var(--text3);">no past logs yet.</div>`;
  },

  /* ════════════════════════════════════════════════
     DASHBOARD
  ════════════════════════════════════════════════ */
  dashboard() {
    const stats = Store.getStats();
    document.getElementById('dash-completed').textContent = stats.completed;
    document.getElementById('dash-inbox').textContent     = stats.inbox;
    document.getElementById('dash-streak').textContent    = stats.bestStreak;
    document.getElementById('dash-waiting').textContent   = stats.waiting;

    /* bar chart */
    const chart = document.getElementById('completion-chart');
    chart.innerHTML = '';
    const history = Store.getWeekHistory();
    const maxVal  = Math.max(1, ...history.map(d => d.count));
    history.forEach(d => {
      const item = document.createElement('div');
      item.className = 'bar-item';
      const h = Math.round((d.count / maxVal) * 60) + 4;
      item.innerHTML = `
        <div class="bar${d.isToday ? ' today-bar' : ''}" style="height:${h}px;" title="${d.count} completed"></div>
        <div class="bar-label">${d.label}</div>
      `;
      chart.appendChild(item);
    });

    /* habit consistency */
    const hChart = document.getElementById('habit-consistency-chart');
    hChart.innerHTML = Store.state.habits.length
      ? Store.state.habits.map(h => {
          const pct = Math.round(h.log.filter(Boolean).length / h.log.length * 100);
          const iconSrc = h.iconFile ? `assets/icons/habits/${h.iconFile}` : '';
          return `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <div style="width:18px;height:18px;flex-shrink:0;">${iconSrc ? `<img src="${iconSrc}" alt="" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none'"/>` : ''}</div>
              <span style="font-family:var(--font-vt);font-size:15px;color:var(--text2);flex:0 0 90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.name}</span>
              <div class="progress-bar-bg" style="flex:1;"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>
              <span style="font-family:var(--font-pixel);font-size:7px;color:var(--g1);min-width:28px;">${pct}%</span>
            </div>`;
        }).join('')
      : `<div style="font-family:var(--font-vt);font-size:16px;color:var(--text3);padding:8px 0;">no habits tracked yet.</div>`;

    /* GTD funnel */
    const funnel = document.getElementById('gtd-funnel-rows');
    const total = Math.max(1, Store.state.tasks.length);
    const rows = [
      { label:'Inbox',       count: stats.inbox,     color:'var(--y)' },
      { label:'Next Action', count: stats.next,      color:'var(--g1)' },
      { label:'Waiting For', count: stats.waiting,   color:'var(--a1)' },
      { label:'Someday',     count: stats.someday,   color:'var(--text3)' },
      { label:'Done',        count: stats.completed, color:'var(--p1)' },
    ];
    funnel.innerHTML = rows.map(r => `
      <div class="funnel-row">
        <div class="funnel-label">${r.label}</div>
        <div class="funnel-bar-bg"><div class="funnel-bar-fill" style="width:${Math.round(r.count/total*100)}%;background:${r.color};"></div></div>
        <div class="funnel-count">${r.count}</div>
      </div>
    `).join('');
  },

  /* ════════════════════════════════════════════════
     TASK DETAIL
  ════════════════════════════════════════════════ */
  taskDetail(taskId) {
    const t = Store.getTask(taskId);
    if (!t) return;

    const stateLabels = { inbox:'INBOX', next:'NEXT ACTION', waiting:'WAITING FOR', someday:'SOMEDAY', reference:'REFERENCE', done:'DONE' };
    const energyLabels = { low:'LOW', med:'MEDIUM', high:'HIGH' };

    let progressHtml = '';
    if (t.progressType === 'percent') {
      progressHtml = `
        <div class="detail-section">
          <div class="detail-section-title">PROGRESS</div>
          <div class="range-wrap">
            <input type="range" class="range-slider" min="0" max="100" value="${t.progressVal || 0}" data-task-progress="${t.id}" />
            <div class="range-val" id="pval-${t.id}">${t.progressVal || 0}%</div>
          </div>
        </div>`;
    } else if (t.progressType === 'numeric') {
      const max = t.progressTarget || 100;
      progressHtml = `
        <div class="detail-section">
          <div class="detail-section-title">PROGRESS</div>
          <div class="range-wrap">
            <input type="range" class="range-slider" min="0" max="${max}" value="${t.progressVal || 0}" data-task-progress="${t.id}" />
            <div class="range-val" id="pval-${t.id}">${t.progressVal || 0}/${max} ${t.progressUnit || ''}</div>
          </div>
        </div>`;
    }

    let subtasksHtml = '';
    if (t.subtasks?.length) {
      subtasksHtml = `
        <div class="detail-section">
          <div class="detail-section-title">SUBTASKS</div>
          ${t.subtasks.map((s,i) => `
            <div class="subtask-item" data-sub-idx="${i}" data-task-id="${t.id}">
              <div class="subtask-cb${s.done?' done':''}"></div>
              <div class="subtask-label${s.done?' done':''}">${s.text}</div>
            </div>`).join('')}
        </div>`;
    }

    const proj = t.projectId ? Store.state.projects[t.projectId] : null;
    const due  = t.dueDate ? formatDue(t.dueDate, null) : null;

    document.getElementById('detail-body').innerHTML = `
      <div class="detail-task-name">${t.title}</div>
      <div class="detail-section">
        <div class="detail-section-title">STATUS</div>
        <div class="detail-row"><div class="detail-key">GTD State</div><div class="detail-val"><span class="tag state-${t.gtdState}">${stateLabels[t.gtdState]||t.gtdState}</span></div></div>
        <div class="detail-row"><div class="detail-key">Energy</div><div class="detail-val">${energyLabels[t.energy]||t.energy}</div></div>
        ${proj ? `<div class="detail-row"><div class="detail-key">Project</div><div class="detail-val">${proj.name}</div></div>` : ''}
        ${due  ? `<div class="detail-row"><div class="detail-key">Due</div><div class="detail-val due-label ${due.cls}">${due.label}</div></div>` : ''}
        ${t.freqDays ? `<div class="detail-row"><div class="detail-key">Frequency</div><div class="detail-val">every ${t.freqDays} days</div></div>` : ''}
        ${t.recurrence ? `<div class="detail-row"><div class="detail-key">Recurrence</div><div class="detail-val">${t.recurrence}</div></div>` : ''}
      </div>
      ${progressHtml}
      ${subtasksHtml}
      ${t.notes ? `<div class="detail-section"><div class="detail-section-title">NOTES</div><div style="font-family:var(--font-vt);font-size:17px;color:var(--text2);line-height:1.6;">${t.notes}</div></div>` : ''}
      <div class="detail-section">
        <div class="detail-section-title">MOVE STATE</div>
        <div class="state-selector" id="detail-state-selector">
          ${Object.entries(stateLabels).map(([s,l]) =>
            `<button class="state-option${t.gtdState===s?' selected':''}" data-move-state="${s}">${l}</button>`
          ).join('')}
        </div>
      </div>
      <div class="btn-row" style="margin-top:16px;">
        <button class="btn-primary" id="btn-mark-done" data-task-id="${t.id}">
          ${t.gtdState === 'done' ? 'REOPEN' : 'MARK DONE \u2726'}
        </button>
        <button class="btn-secondary" id="btn-delete-task" data-task-id="${t.id}" style="color:var(--a1);border-color:var(--a1);">DELETE</button>
      </div>
    `;

    /* wire events */
    document.querySelectorAll('[data-task-progress]').forEach(slider => {
      slider.addEventListener('input', () => {
        const id = slider.dataset.taskProgress;
        const val = parseInt(slider.value);
        Store.updateTask(id, { progressVal: val });
        const label = document.getElementById(`pval-${id}`);
        const tk = Store.getTask(id);
        if (label) label.textContent = tk.progressType === 'percent'
          ? `${val}%`
          : `${val}/${tk.progressTarget} ${tk.progressUnit||''}`;
      });
    });

    document.querySelectorAll('.subtask-item').forEach(item => {
      item.addEventListener('click', () => {
        const taskId = item.dataset.taskId;
        const idx    = parseInt(item.dataset.subIdx);
        const tk     = Store.getTask(taskId);
        if (!tk) return;
        tk.subtasks[idx].done = !tk.subtasks[idx].done;
        Store.updateTask(taskId, { subtasks: tk.subtasks });
        Render.taskDetail(taskId);
      });
    });

    document.querySelectorAll('[data-move-state]').forEach(btn => {
      btn.addEventListener('click', () => {
        const newState = btn.dataset.moveState;
        if (newState === 'done') Store.recordCompletion();
        Store.updateTask(t.id, { gtdState: newState });
        Render.taskDetail(t.id);
        App.toast(`moved to ${newState}`);
      });
    });

    document.getElementById('btn-mark-done').addEventListener('click', () => {
      const tk = Store.getTask(t.id);
      const newState = tk.gtdState === 'done' ? 'inbox' : 'done';
      if (newState === 'done') { Store.recordCompletion(); Store.updateTask(t.id, { lastCompletedAt: Date.now() }); }
      Store.updateTask(t.id, { gtdState: newState });
      App.toast(newState === 'done' ? 'task done!' : 'task reopened');
      App.closeDetail();
    });

    document.getElementById('btn-delete-task').addEventListener('click', () => {
      if (!confirm('Delete this task?')) return;
      Store.deleteTask(t.id);
      App.toast('deleted');
      App.closeDetail();
    });
  },

  /* ════════════════════════════════════════════════
     SHARED HELPERS
  ════════════════════════════════════════════════ */
  _taskCard(task) {
    const div = document.createElement('div');
    div.className = `card state-${task.gtdState}`;
    div.dataset.taskId = task.id;

    const stateLabels = { inbox:'INBOX', next:'NEXT', waiting:'WAITING', someday:'SOMEDAY', reference:'REF', done:'DONE' };
    const due = formatDue(task.dueDate, task.freqDays);

    let progressHtml = '';
    if (task.progressType === 'percent') {
      progressHtml = `<div class="progress-wrap"><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${task.progressVal||0}%;"></div></div><div class="progress-label">${task.progressVal||0}%</div></div>`;
    } else if (task.progressType === 'numeric' && task.progressTarget) {
      const pct = Math.round(Math.min(task.progressVal||0, task.progressTarget) / task.progressTarget * 100);
      progressHtml = `<div class="progress-wrap"><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;"></div></div><div class="progress-label">${task.progressVal||0}/${task.progressTarget} ${task.progressUnit||''}</div></div>`;
    }

    const proj = task.projectId ? Store.state.projects[task.projectId] : null;

    div.innerHTML = `
      <div class="task-title">${task.title}</div>
      <div class="task-meta">
        <span class="tag state-${task.gtdState}">${stateLabels[task.gtdState]||task.gtdState}</span>
        <span class="tag energy-${task.energy}">${(task.energy||'').toUpperCase()}</span>
        ${proj ? `<span class="tag">${proj.name}</span>` : ''}
        ${due  ? `<span class="due-label ${due.cls}">${due.label}</span>` : ''}
      </div>
      ${progressHtml}
    `;

    div.addEventListener('click', () => App.openDetail(task.id));
    return div;
  },

  _eventChip(event) {
    const typeIcons = {
      birthday:    'assets/icons/events/birthday.png',
      anniversary: 'assets/icons/events/anniversary.png',
      deadline:    'assets/icons/events/deadline.png',
      reminder:    'assets/icons/events/reminder.png',
      other:       'assets/icons/events/other.png',
    };
    const iconSrc = typeIcons[event.type] || typeIcons.other;
    const diff    = daysUntil(event.date);
    const diffLabel = diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : `in ${diff} days`;

    const chip = document.createElement('div');
    chip.className = 'event-chip';
    chip.innerHTML = `
      <div class="event-chip-icon-img">
        <img src="${iconSrc}" alt="${event.type}" onerror="this.style.display='none'" />
      </div>
      <div class="event-chip-info">
        <div class="event-chip-name">${event.name}</div>
        <div class="event-chip-date">${diffLabel} &middot; ${event.date}</div>
      </div>
      <div class="event-chip-badge">${event.type.toUpperCase()}</div>
    `;
    return chip;
  },

  _emptyState(text) {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = `
      <div class="empty-icon">
        <img src="assets/icons/empty-state.png" alt="" onerror="this.style.display='none'" />
      </div>
      <div class="empty-text">${text.replace(/\n/g,'<br>')}</div>
    `;
    return div;
  },
};