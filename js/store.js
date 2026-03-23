// js/store.js
// ─────────────────────────────────────────────────────────
// In-memory app state.
// Reads from IndexedDB cache (populated by Sync).
// All writes go through Sync.write() — which is online-or-queue.
// ─────────────────────────────────────────────────────────

const Store = {
  // In-memory state — authoritative view for rendering
  tasks:        [],
  habits:       [],
  habitLogs:    [],
  events:       [],
  areas:        [],
  projects:     [],
  scratchItems: [],
  scratchLogs:  [],
  nudges:       [],
  user:         null,
  completionHistory: [],

  // ── Load from cache into memory ───────────────────────

  async loadAll() {
    const [tasks, habits, habitLogs, events, areas, projects, scratchItems] = await Promise.all([
      Cache.get('tasks')      .then(d => d ?? []),
      Cache.get('habits')     .then(d => d ?? []),
      Cache.get('habit_logs') .then(d => d ?? []),
      Cache.get('events')     .then(d => d ?? []),
      Cache.get('areas')      .then(d => d ?? []),
      Cache.get('projects')   .then(d => d ?? []),
      Cache.get('scratch_items').then(d => d ?? []),
    ]);
    Store.tasks        = tasks;
    Store.habits       = habits;
    Store.habitLogs    = habitLogs;
    Store.events       = events;
    Store.areas        = areas;
    Store.projects     = projects;
    Store.scratchItems = scratchItems;

    // Build a projects lookup map for convenience
    Store._projectMap = Object.fromEntries(Store.projects.map(p => [p.id, p]));
    Store._areaMap    = Object.fromEntries(Store.areas.map(a => [a.id, a]));
  },

  // Re-load a single table from cache (called after realtime push)
  async reloadTable(table) {
    const rows = await Cache.get(table) ?? [];
    const map = {
      tasks:        () => { Store.tasks        = rows; },
      habits:       () => { Store.habits       = rows; },
      habit_logs:   () => { Store.habitLogs    = rows; },
      events:       () => { Store.events       = rows; },
      areas:        () => { Store.areas        = rows; Store._areaMap    = Object.fromEntries(rows.map(a => [a.id, a])); },
      projects:     () => { Store.projects     = rows; Store._projectMap = Object.fromEntries(rows.map(p => [p.id, p])); },
      scratch_items:() => { Store.scratchItems = rows; },
    };
    map[table]?.();
  },

  // ── Computed getters ──────────────────────────────────

  getTodayTasks() {
    const today = new Date().toISOString().split('T')[0];
    return Store.tasks.filter(t =>
      t.gtd_state !== 'done' &&
      (t.gtd_state === 'next' || t.due_date === today)
    );
  },

  getOverdueFreqTasks() {
    const now = Date.now();
    return Store.tasks.filter(t => {
      if (!t.freq_days || t.gtd_state === 'done') return false;
      const last = t.last_completed_at
        ? new Date(t.last_completed_at).getTime()
        : new Date(t.created_at).getTime();
      return (now - last) / 86_400_000 > t.freq_days;
    });
  },

  getUpcomingEvents(days = 30) {
    const now   = new Date(); now.setHours(0,0,0,0);
    const limit = new Date(now); limit.setDate(limit.getDate() + days);
    return Store.events
      .filter(e => {
        const d = new Date(e.event_date + 'T00:00:00');
        return d >= now && d <= limit;
      })
      .sort((a,b) => a.event_date.localeCompare(b.event_date));
  },

  // Build a map of habitId → { [dateString]: value } for the last 7 days
  getHabitLogMap() {
    const map = {};
    for (const log of Store.habitLogs) {
      if (!map[log.habit_id]) map[log.habit_id] = {};
      map[log.habit_id][log.log_date] = log.value;
    }
    return map;
  },

  // Returns last 7 date strings (Mon first)
  getLast7Days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  },

  getStats() {
    const t = Store.tasks;
    const streaks = Store.habits.map(h => h.streak ?? 0);
    return {
      completed:  t.filter(x => x.gtd_state === 'done').length,
      inbox:      t.filter(x => x.gtd_state === 'inbox').length,
      next:       t.filter(x => x.gtd_state === 'next').length,
      waiting:    t.filter(x => x.gtd_state === 'waiting').length,
      someday:    t.filter(x => x.gtd_state === 'someday').length,
      reference:  t.filter(x => x.gtd_state === 'reference').length,
      bestStreak: streaks.length ? Math.max(...streaks) : 0,
    };
  },

  getWeekHistory() {
    const days   = [];
    const today  = new Date();
    const labels = ['M','T','W','T','F','S','S'];
    for (let i = 6; i >= 0; i--) {
      const d   = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const entry = Store.completionHistory.find(e => e.log_date === key);
      days.push({ label: labels[dow], count: entry?.count ?? 0, isToday: i === 0 });
    }
    return days;
  },

  // ── Write helpers (go through Sync) ───────────────────

  async addTask(data) {
    // Optimistic: add to local array immediately
    const tempId = 'temp-' + Date.now();
    const optimistic = { id: tempId, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    Store.tasks.unshift(optimistic);

    await Sync.write('tasks', 'insert', data, null);
    // After sync, reload authoritative data
    await Store.reloadTable('tasks');
  },

  async updateTask(id, patch) {
    const idx = Store.tasks.findIndex(t => t.id === id);
    if (idx !== -1) Store.tasks[idx] = { ...Store.tasks[idx], ...patch };
    await Sync.write('tasks', 'update', { id, ...patch }, null);
    await Store.reloadTable('tasks');
  },

  async deleteTask(id) {
    Store.tasks = Store.tasks.filter(t => t.id !== id);
    await Sync.write('tasks', 'delete', { id }, null);
  },

  async markTaskDone(id) {
    await Store.updateTask(id, {
      gtd_state:        'done',
      last_completed_at: new Date().toISOString(),
    });
    await DB.recordCompletion();
    await Cache.set('completion_history', await DB.getCompletionHistory());
    Store.completionHistory = await Cache.get('completion_history') ?? [];
  },

  async addHabit(data) {
    await Sync.write('habits', 'insert', data, null);
    await Store.reloadTable('habits');
  },

  async toggleHabitLog(habitId, logDate, currentValue) {
    const newValue = currentValue ? 0 : 1;
    // Optimistic
    const logMap = Store.getHabitLogMap();
    if (!logMap[habitId]) logMap[habitId] = {};
    logMap[habitId][logDate] = newValue;

    await Sync.write('habit_logs', 'upsert', { habit_id: habitId, log_date: logDate, value: newValue }, null);
    await Store.reloadTable('habit_logs');
    await Store.reloadTable('habits'); // streak update
  },

  async addEvent(data) {
    await Sync.write('events', 'insert', data, null);
    await Store.reloadTable('events');
    // Schedule local notification
    const fireDate = new Date(data.event_date + 'T09:00:00');
    fireDate.setDate(fireDate.getDate() - (data.reminder_offset_days ?? 7));
    LocalNotifications.schedule(
      'event-' + data.event_date + '-' + data.name,
      'nudget reminder',
      data.name,
      fireDate
    );
  },

  async addScratchItem(text) {
    const tempId = 'temp-' + Date.now();
    const today  = new Date().toISOString().split('T')[0];
    Store.scratchItems.push({ id: tempId, text, done: false, item_date: today });
    await Sync.write('scratch_items', 'insert', { text }, null);
    await Store.reloadTable('scratch_items');
  },

  async toggleScratch(id) {
    const item = Store.scratchItems.find(x => x.id === id);
    if (!item) return;
    item.done = !item.done;
    await Sync.write('scratch_items', 'update', { id, done: item.done }, null);
  },

  async deleteScratch(id) {
    Store.scratchItems = Store.scratchItems.filter(x => x.id !== id);
    await Sync.write('scratch_items', 'delete', { id }, null);
  },

  async addArea(name) {
    const data = { name: name.toUpperCase(), color: 'var(--p1)', sort_order: Store.areas.length };
    await DB.addArea(data);
    await Sync._refreshTable('areas');
    await Store.reloadTable('areas');
    return Store.areas[Store.areas.length - 1];
  },

  async addProject(areaId, name) {
    const data = { area_id: areaId, name, sort_order: Store.projects.length };
    await DB.addProject(data);
    await Sync._refreshTable('projects');
    await Store.reloadTable('projects');
  },

  getTask(id) {
    return Store.tasks.find(t => t.id === id);
  },

  getProjectsForArea(areaId) {
    return Store.projects.filter(p => p.area_id === areaId);
  },

  // Populate a <select> with current projects
  populateProjectSelect(selectEl) {
    selectEl.innerHTML = '<option value="">none</option>';
    Store.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value       = p.id;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    });
  },
};