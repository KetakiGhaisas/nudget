// js/sync.js
// ─────────────────────────────────────────────────────────
// Offline-first sync engine.
//
// HOW IT WORKS:
//   When online:  writes go directly to Supabase via DB.*
//   When offline: writes go into an IndexedDB queue
//   On reconnect: the queue flushes to Supabase in order
//
// What works offline:
//   - View all tasks, habits, events (from cache)
//   - Add tasks, scratch items, habit check-offs (queued)
//   - Local reminders (fired by Notification API)
//
// What requires online:
//   - AI capture (Groq API)
//   - Syncing changes to/from other devices
//   - Initial login / account creation
// ─────────────────────────────────────────────────────────

const CACHE_DB_NAME  = 'nudget_cache';
const CACHE_DB_VER   = 1;
const QUEUE_STORE    = 'sync_queue';
const CACHE_STORE    = 'table_cache';

let _idb = null;

// ── Open IndexedDB ────────────────────────────────────────

function openIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      // Sync queue: stores offline mutations
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const qs = db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        qs.createIndex('by_table', 'table');
      }
      // Table cache: stores last-fetched data per table
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'table' });
      }
    };
    req.onsuccess = e => { _idb = e.target.result; resolve(_idb); };
    req.onerror   = () => reject(req.error);
  });
}

// ── IDB helpers ───────────────────────────────────────────

async function idbGet(store, key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbPut(store, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbAdd(store, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).add(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbDelete(store, key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function idbGetAll(store) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });
}

// ── Cache (table data) ────────────────────────────────────

const Cache = {
  async set(table, rows) {
    await idbPut(CACHE_STORE, { table, rows, updatedAt: Date.now() });
  },
  async get(table) {
    const entry = await idbGet(CACHE_STORE, table);
    return entry?.rows ?? null;
  },
};

// ── Sync queue ────────────────────────────────────────────

const Queue = {
  async push(operation) {
    // operation: { table, method, payload, tempId }
    await idbAdd(QUEUE_STORE, { ...operation, createdAt: Date.now(), retries: 0 });
  },

  async getAll() {
    return idbGetAll(QUEUE_STORE);
  },

  async remove(id) {
    await idbDelete(QUEUE_STORE, id);
  },

  async size() {
    const all = await idbGetAll(QUEUE_STORE);
    return all.length;
  },
};

// ── Network detection ─────────────────────────────────────

const Network = {
  isOnline() { return navigator.onLine; },

  onChange(callback) {
    window.addEventListener('online',  () => callback(true));
    window.addEventListener('offline', () => callback(false));
  },
};

// ── Main Sync object ──────────────────────────────────────

const Sync = {
  _flushing: false,
  _channels: [],

  // Call once after login — loads data into cache and subscribes to realtime
  async init(userId) {
    await Sync._primeCache();
    if (Network.isOnline()) {
      Sync._subscribeRealtime(userId);
      await Sync.flush();
    }
    Network.onChange(async online => {
      Sync._updateBanner(online);
      if (online) {
        Sync._subscribeRealtime(userId);
        await Sync.flush();
      }
    });
    Sync._updateBanner(Network.isOnline());
  },

  // Load fresh data from Supabase and cache it
  async _primeCache() {
    if (!Network.isOnline()) return;
    try {
      const [tasks, habits, habitLogs, events, areas, projects] = await Promise.all([
        DB.getTasks(),
        DB.getHabits(),
        DB.getHabitLogs(),
        DB.getEvents(),
        DB.getAreas(),
        DB.getProjects(),
      ]);
      await Promise.all([
        Cache.set('tasks',      tasks),
        Cache.set('habits',     habits),
        Cache.set('habit_logs', habitLogs),
        Cache.set('events',     events),
        Cache.set('areas',      areas),
        Cache.set('projects',   projects),
      ]);
    } catch (err) {
      console.warn('Sync._primeCache failed:', err.message);
    }
  },

  // Subscribe to Supabase Realtime for live updates on other devices
  _subscribeRealtime(userId) {
    // Unsubscribe existing channels first
    Sync._channels.forEach(ch => DB.unsubscribe(ch));
    Sync._channels = [];

    const tables = ['tasks', 'habits', 'habit_logs', 'events', 'scratch_items'];
    tables.forEach(table => {
      const ch = DB.subscribeToTable(table, userId, async payload => {
        // Refresh the local cache for this table
        await Sync._refreshTable(table);
        // Notify the app to re-render
        window.dispatchEvent(new CustomEvent('nudget:sync', { detail: { table, payload } }));
      });
      Sync._channels.push(ch);
    });
  },

  async _refreshTable(table) {
    try {
      let rows;
      if (table === 'tasks')      rows = await DB.getTasks();
      if (table === 'habits')     rows = await DB.getHabits();
      if (table === 'habit_logs') rows = await DB.getHabitLogs();
      if (table === 'events')     rows = await DB.getEvents();
      if (table === 'scratch_items') rows = await DB.getScratchItems();
      if (rows) await Cache.set(table, rows);
    } catch (err) {
      console.warn(`Sync._refreshTable(${table}) failed:`, err.message);
    }
  },

  // Flush queued offline mutations to Supabase
  async flush() {
    if (Sync._flushing || !Network.isOnline()) return;
    const pending = await Queue.getAll();
    if (!pending.length) return;

    Sync._flushing = true;
    console.log(`Sync.flush: ${pending.length} queued operations`);

    for (const op of pending) {
      try {
        await Sync._applyOperation(op);
        await Queue.remove(op.id);
      } catch (err) {
        console.warn(`Sync.flush: failed to apply op ${op.id}:`, err.message);
        // Leave in queue for retry; don't block other ops
      }
    }

    // Re-prime cache after flush
    await Sync._primeCache();
    window.dispatchEvent(new CustomEvent('nudget:sync', { detail: { table: 'all' } }));
    Sync._flushing = false;
  },

  async _applyOperation(op) {
    const { table, method, payload } = op;
    switch (`${table}.${method}`) {
      case 'tasks.insert':          await DB.addTask(payload);              break;
      case 'tasks.update':          await DB.updateTask(payload.id, payload); break;
      case 'tasks.delete':          await DB.deleteTask(payload.id);        break;
      case 'scratch_items.insert':  await DB.addScratchItem(payload.text);  break;
      case 'scratch_items.update':  await DB.toggleScratchItem(payload.id, payload.done); break;
      case 'scratch_items.delete':  await DB.deleteScratchItem(payload.id); break;
      case 'habit_logs.upsert':     await DB.upsertHabitLog(payload.habit_id, payload.log_date, payload.value); break;
      case 'habits.insert':         await DB.addHabit(payload);             break;
      case 'events.insert':         await DB.addEvent(payload);             break;
      default:
        console.warn(`Sync: unknown operation ${table}.${method}`);
    }
  },

  // ── Public write helpers ─────────────────────────────────
  // Use these instead of calling DB.* directly from the app.
  // They go online if possible, queue if not.

  async write(table, method, payload, optimisticUpdate) {
    // Optimistic update: immediately update local state for snappy UI
    if (optimisticUpdate) optimisticUpdate();

    if (Network.isOnline()) {
      try {
        const result = await Sync._applyOperation({ table, method, payload });
        await Sync._refreshTable(table);
        return result;
      } catch (err) {
        // Fall through to queue
        console.warn('Sync.write: online write failed, queuing:', err.message);
      }
    }

    // Queue for later
    await Queue.push({ table, method, payload });
    const queueSize = await Queue.size();
    Sync._updateBanner(false, queueSize);
  },

  // ── Offline banner ────────────────────────────────────────
  _updateBanner(online, queueSize = 0) {
    let banner = document.getElementById('offline-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.style.cssText = `
        position:fixed;top:0;left:0;right:0;z-index:2000;
        font-family:var(--font-pixel);font-size:6px;letter-spacing:0.08em;
        text-align:center;padding:6px;transition:all 0.3s;
        max-width:420px;margin:0 auto;
      `;
      document.body.appendChild(banner);
    }

    if (online && queueSize === 0) {
      banner.style.display = 'none';
    } else if (!online) {
      banner.style.display = 'block';
      banner.style.background = 'var(--y)';
      banner.style.color = 'var(--bg)';
      banner.textContent = queueSize > 0
        ? `OFFLINE \u2014 ${queueSize} change${queueSize !== 1 ? 's' : ''} queued`
        : 'OFFLINE \u2014 changes will sync when reconnected';
    } else if (queueSize > 0) {
      banner.style.display = 'block';
      banner.style.background = 'var(--g1)';
      banner.style.color = 'var(--bg)';
      banner.textContent = `SYNCING ${queueSize} CHANGE${queueSize !== 1 ? 'S' : ''}...`;
      setTimeout(() => { if (banner) banner.style.display = 'none'; }, 2000);
    }
  },
};

// ── LocalNotifications (offline reminders) ────────────────
// Schedule a browser notification for a task due date or event reminder.
// Works fully offline — uses the Notifications API + localStorage to track.

const LocalNotifications = {
  async requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  schedule(id, title, body, fireAt) {
    // We can't schedule future notifications natively in most browsers.
    // We store them in localStorage and a setInterval checks every minute.
    const reminders = JSON.parse(localStorage.getItem('nudget_reminders') || '[]');
    reminders.push({ id, title, body, fireAt: fireAt.getTime() });
    localStorage.setItem('nudget_reminders', JSON.stringify(reminders));
  },

  cancel(id) {
    const reminders = JSON.parse(localStorage.getItem('nudget_reminders') || '[]');
    localStorage.setItem('nudget_reminders', JSON.stringify(reminders.filter(r => r.id !== id)));
  },

  _tick() {
    if (Notification.permission !== 'granted') return;
    const now = Date.now();
    const reminders = JSON.parse(localStorage.getItem('nudget_reminders') || '[]');
    const pending   = [];
    for (const r of reminders) {
      if (r.fireAt <= now) {
        new Notification(r.title, { body: r.body, icon: 'assets/icons/icon-32.png' });
      } else {
        pending.push(r);
      }
    }
    localStorage.setItem('nudget_reminders', JSON.stringify(pending));
  },

  start() {
    setInterval(LocalNotifications._tick, 60_000);
    LocalNotifications._tick(); // fire immediately for any missed reminders
  },
};