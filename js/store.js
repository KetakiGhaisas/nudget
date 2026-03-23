/* ═══════════════════════════════════════════════════
   NUDGET — DATA STORE
   All app state lives here. Persisted to localStorage.
   No hardcoded tasks — user starts with an empty board.
═══════════════════════════════════════════════════ */

const STORAGE_KEY = 'nudget_v1';

const DEFAULT_STATE = {
  tasks:       [],
  habits:      [],
  events:      [],
  scratchItems:[],
  scratchLogs: [],
  areas: [
    { id: 'area-1', name: 'PERSONAL', color: 'var(--a1)', projects: ['project-1'] },
  ],
  projects: {
    'project-1': { id: 'project-1', name: 'Personal', areaId: 'area-1' },
  },
  /* completion history — one entry per day: { date:'YYYY-MM-DD', count:N } */
  completionHistory: [],
  nextId: 1,
  theme: '',
  /* user config */
  userName: '',
  scratchRollover: true,   /* true = incomplete scratch tasks roll over; false = dismissed */
  nudgeThresholdDays: 3,   /* days of ignored nudge before it escalates to inbox task */
};

/* ─── Load / Save ─── */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const saved = JSON.parse(raw);
    /* merge to handle new fields added in future versions */
    return Object.assign(structuredClone(DEFAULT_STATE), saved);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Store.state));
  } catch (e) {
    console.warn('nudget: could not save state', e);
  }
}

/* ─── Store object ─── */
const Store = {
  state: loadState(),

  /* helpers */
  _id() {
    const id = this.state.nextId++;
    saveState();
    return id;
  },

  /* ── Tasks ── */
  addTask(task) {
    const t = { ...task, id: 'task-' + this._id(), createdAt: Date.now() };
    this.state.tasks.push(t);
    saveState();
    return t;
  },
  updateTask(id, patch) {
    const idx = this.state.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    this.state.tasks[idx] = { ...this.state.tasks[idx], ...patch };
    saveState();
  },
  deleteTask(id) {
    this.state.tasks = this.state.tasks.filter(t => t.id !== id);
    saveState();
  },
  getTask(id) {
    return this.state.tasks.find(t => t.id === id);
  },
  /* Tasks for today = state is 'next' or due date is today */
  getTodayTasks() {
    const today = todayStr();
    return this.state.tasks.filter(t =>
      t.gtdState !== 'done' && (t.gtdState === 'next' || t.dueDate === today)
    );
  },
  /* Frequency tasks that are overdue */
  getOverdueFreqTasks() {
    const now = Date.now();
    return this.state.tasks.filter(t => {
      if (!t.freqDays || t.gtdState === 'done') return false;
      const last = t.lastCompletedAt || t.createdAt || 0;
      const daysSince = (now - last) / 86400000;
      return daysSince > t.freqDays;
    });
  },

  /* ── Habits ── */
  addHabit(habit) {
    const h = { ...habit, id: 'habit-' + this._id(), createdAt: Date.now(),
      /* log = last 7 days, each entry: null|0|1|number */
      log: [null,null,null,null,null,null,null] };
    this.state.habits.push(h);
    saveState();
    return h;
  },
  updateHabitLog(id, dayOffset, value) {
    /* dayOffset 0 = today, 1 = yesterday, ... 6 = 6 days ago */
    const h = this.state.habits.find(x => x.id === id);
    if (!h) return;
    h.log[6 - dayOffset] = value;
    h.streak = computeStreak(h.log);
    saveState();
  },
  deleteHabit(id) {
    this.state.habits = this.state.habits.filter(h => h.id !== id);
    saveState();
  },

  /* ── Events ── */
  addEvent(ev) {
    const e = { ...ev, id: 'event-' + this._id() };
    this.state.events.push(e);
    saveState();
    return e;
  },
  deleteEvent(id) {
    this.state.events = this.state.events.filter(e => e.id !== id);
    saveState();
  },
  getUpcomingEvents(days = 30) {
    const now = new Date(); now.setHours(0,0,0,0);
    const limit = new Date(now); limit.setDate(limit.getDate() + days);
    return this.state.events
      .filter(e => {
        const d = new Date(e.date + 'T00:00:00');
        return d >= now && d <= limit;
      })
      .sort((a,b) => new Date(a.date) - new Date(b.date));
  },

  /* ── Scratch pad ── */
  addScratch(text) {
    const item = { id: 'scratch-' + this._id(), text, done: false, date: todayStr() };
    this.state.scratchItems.push(item);
    saveState();
    return item;
  },
  toggleScratch(id) {
    const item = this.state.scratchItems.find(x => x.id === id);
    if (!item) return;
    item.done = !item.done;
    saveState();
  },
  deleteScratch(id) {
    this.state.scratchItems = this.state.scratchItems.filter(x => x.id !== id);
    saveState();
  },
  /* Call at midnight to collapse today's done items into a log entry */
  collapseToday() {
    const today = todayStr();
    const done = this.state.scratchItems.filter(x => x.date === today && x.done);
    if (done.length) {
      this.state.scratchLogs.unshift({ date: formatDateDisplay(new Date()), count: done.length });
      this.state.scratchLogs = this.state.scratchLogs.slice(0, 30); /* keep last 30 */
    }
    if (this.state.scratchRollover) {
      /* keep incomplete, remove done */
      this.state.scratchItems = this.state.scratchItems.filter(x => !x.done || x.date !== today);
    } else {
      /* remove all of today's items */
      this.state.scratchItems = this.state.scratchItems.filter(x => x.date !== today);
    }
    saveState();
  },

  /* ── Areas & Projects ── */
  addArea(name) {
    const id = 'area-' + this._id();
    this.state.areas.push({ id, name: name.toUpperCase(), color: 'var(--p1)', projects: [] });
    saveState();
    return id;
  },
  addProject(areaId, name) {
    const id = 'project-' + this._id();
    this.state.projects[id] = { id, name, areaId };
    const area = this.state.areas.find(a => a.id === areaId);
    if (area) area.projects.push(id);
    saveState();
    return id;
  },

  /* ── Completion history ── */
  recordCompletion() {
    const today = todayStr();
    const entry = this.state.completionHistory.find(e => e.date === today);
    if (entry) { entry.count++; }
    else { this.state.completionHistory.push({ date: today, count: 1 }); }
    saveState();
  },
  getWeekHistory() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const entry = this.state.completionHistory.find(e => e.date === key);
      days.push({ label: ['M','T','W','T','F','S','S'][d.getDay() === 0 ? 6 : d.getDay()-1], count: entry?.count || 0, isToday: i === 0 });
    }
    return days;
  },

  /* ── Theme ── */
  setTheme(theme) {
    this.state.theme = theme;
    saveState();
  },

  /* ── Computed stats ── */
  getStats() {
    const tasks = this.state.tasks;
    return {
      completed:  tasks.filter(t => t.gtdState === 'done').length,
      inbox:      tasks.filter(t => t.gtdState === 'inbox').length,
      next:       tasks.filter(t => t.gtdState === 'next').length,
      waiting:    tasks.filter(t => t.gtdState === 'waiting').length,
      someday:    tasks.filter(t => t.gtdState === 'someday').length,
      reference:  tasks.filter(t => t.gtdState === 'reference').length,
      bestStreak: Math.max(0, ...this.state.habits.map(h => h.streak || 0)),
    };
  },
};

/* ─── Utility ─── */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDateDisplay(d) {
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

function computeStreak(log) {
  /* log[6] = today, log[5] = yesterday, ...
     streak = consecutive 'done' (truthy) values from today backward */
  let streak = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]) streak++;
    else break;
  }
  return streak;
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function formatDue(dateStr, freqDays) {
  if (freqDays) return { label: `every ${freqDays}d`, cls: 'freq' };
  if (!dateStr) return null;
  const diff = daysUntil(dateStr);
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: 'overdue' };
  if (diff === 0) return { label: 'today', cls: 'today' };
  return { label: `${diff}d`, cls: '' };
}

/* Populate the project <select> with current projects */
function populateProjectSelect(selectEl) {
  selectEl.innerHTML = '<option value="">none</option>';
  Object.values(Store.state.projects).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    selectEl.appendChild(opt);
  });
}