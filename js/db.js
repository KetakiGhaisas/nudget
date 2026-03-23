// js/db.js
// ─────────────────────────────────────────────────────────
// Thin wrapper around the Supabase JS client.
// All database reads and writes go through this module.
// The rest of the app never imports @supabase/supabase-js directly.
// ─────────────────────────────────────────────────────────

// Supabase JS v2 loaded via CDN in index.html:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
// Exposes window.supabase.createClient

let _client = null;

function getClient() {
  if (_client) return _client;
  if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('YOUR_PROJECT')) {
    throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js');
  }
  _client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
  return _client;
}

// ── Auth ──────────────────────────────────────────────────

const Auth = {
  async signUp(email, password, name) {
    const { data, error } = await getClient().auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signInGoogle() {
    const { error } = await getClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  },

  async signOut() {
    await getClient().auth.signOut();
  },

  async getSession() {
    const { data } = await getClient().auth.getSession();
    return data.session;
  },

  onAuthChange(callback) {
    getClient().auth.onAuthStateChange((_event, session) => callback(session));
  },

  async currentUser() {
    const { data } = await getClient().auth.getUser();
    return data.user;
  },
};

// ── Generic helpers ───────────────────────────────────────

async function _select(table, query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function _single(table, query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

function _userId() {
  // synchronous helper — assumes session already loaded
  return getClient().auth.getUser().then(({ data }) => data.user?.id);
}

// ── Users ─────────────────────────────────────────────────

const DB = {

  async getProfile() {
    const user = await Auth.currentUser();
    return _single('users', getClient().from('users').select('*').eq('id', user.id).single());
  },

  async updateProfile(patch) {
    const user = await Auth.currentUser();
    const { error } = await getClient().from('users').update(patch).eq('id', user.id);
    if (error) throw error;
  },

  // ── Areas ──────────────────────────────────────────────

  async getAreas() {
    const user = await Auth.currentUser();
    return _select('areas', getClient().from('areas').select('*').eq('user_id', user.id).order('sort_order'));
  },

  async addArea(data) {
    const user = await Auth.currentUser();
    return _single('areas', getClient().from('areas').insert({ ...data, user_id: user.id }).select().single());
  },

  async updateArea(id, patch) {
    const { error } = await getClient().from('areas').update(patch).eq('id', id);
    if (error) throw error;
  },

  async deleteArea(id) {
    const { error } = await getClient().from('areas').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Projects ───────────────────────────────────────────

  async getProjects() {
    const user = await Auth.currentUser();
    return _select('projects', getClient().from('projects').select('*').eq('user_id', user.id).order('sort_order'));
  },

  async addProject(data) {
    const user = await Auth.currentUser();
    return _single('projects', getClient().from('projects').insert({ ...data, user_id: user.id }).select().single());
  },

  async deleteProject(id) {
    const { error } = await getClient().from('projects').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Tasks ──────────────────────────────────────────────

  async getTasks() {
    const user = await Auth.currentUser();
    return _select('tasks',
      getClient()
        .from('tasks')
        .select(`*, subtasks(*), task_projects(project_id)`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
    );
  },

  async addTask(data) {
    const user = await Auth.currentUser();
    const { subtasks = [], projectIds = [], ...taskData } = data;
    // Insert task
    const task = await _single('tasks',
      getClient().from('tasks').insert({ ...taskData, user_id: user.id }).select().single()
    );
    // Insert subtasks
    if (subtasks.length) {
      await getClient().from('subtasks').insert(
        subtasks.map((s, i) => ({ task_id: task.id, text: s.text, done: s.done ?? false, sort_order: i }))
      );
    }
    // Link projects
    if (projectIds.length) {
      await getClient().from('task_projects').insert(
        projectIds.map(pid => ({ task_id: task.id, project_id: pid }))
      );
    }
    return task;
  },

  async updateTask(id, patch) {
    const { subtasks, projectIds, ...taskPatch } = patch;
    if (Object.keys(taskPatch).length) {
      const { error } = await getClient().from('tasks').update(taskPatch).eq('id', id);
      if (error) throw error;
    }
    if (subtasks) {
      await getClient().from('subtasks').delete().eq('task_id', id);
      if (subtasks.length) {
        await getClient().from('subtasks').insert(
          subtasks.map((s, i) => ({ task_id: id, text: s.text, done: s.done ?? false, sort_order: i }))
        );
      }
    }
    if (projectIds) {
      await getClient().from('task_projects').delete().eq('task_id', id);
      if (projectIds.length) {
        await getClient().from('task_projects').insert(
          projectIds.map(pid => ({ task_id: id, project_id: pid }))
        );
      }
    }
  },

  async deleteTask(id) {
    const { error } = await getClient().from('tasks').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Habits ─────────────────────────────────────────────

  async getHabits() {
    const user = await Auth.currentUser();
    return _select('habits', getClient().from('habits').select('*').eq('user_id', user.id).order('sort_order'));
  },

  async addHabit(data) {
    const user = await Auth.currentUser();
    return _single('habits', getClient().from('habits').insert({ ...data, user_id: user.id }).select().single());
  },

  async deleteHabit(id) {
    const { error } = await getClient().from('habits').delete().eq('id', id);
    if (error) throw error;
  },

  // Get last 7 days of logs for all habits
  async getHabitLogs() {
    const user = await Auth.currentUser();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const fromDate = sevenDaysAgo.toISOString().split('T')[0];
    return _select('habit_logs',
      getClient()
        .from('habit_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('log_date', fromDate)
        .order('log_date')
    );
  },

  async upsertHabitLog(habitId, logDate, value) {
    const user = await Auth.currentUser();
    const { error } = await getClient().from('habit_logs').upsert({
      habit_id: habitId,
      user_id:  user.id,
      log_date: logDate,
      value,
    }, { onConflict: 'habit_id,log_date' });
    if (error) throw error;
    // Recompute streak
    await DB._recomputeStreak(habitId);
  },

  async deleteHabitLog(habitId, logDate) {
    const user = await Auth.currentUser();
    await getClient().from('habit_logs')
      .delete()
      .eq('habit_id', habitId)
      .eq('user_id', user.id)
      .eq('log_date', logDate);
    await DB._recomputeStreak(habitId);
  },

  async _recomputeStreak(habitId) {
    // Fetch last 60 days of logs, count consecutive done days ending today
    const from = new Date();
    from.setDate(from.getDate() - 59);
    const { data: logs } = await getClient()
      .from('habit_logs')
      .select('log_date, value')
      .eq('habit_id', habitId)
      .gte('log_date', from.toISOString().split('T')[0])
      .order('log_date', { ascending: false });

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const log = logs?.find(l => l.log_date === ds);
      if (log?.value) streak++;
      else break;
    }
    await getClient().from('habits').update({ streak }).eq('id', habitId);
  },

  // ── Events ─────────────────────────────────────────────

  async getEvents() {
    const user = await Auth.currentUser();
    return _select('events', getClient().from('events').select('*').eq('user_id', user.id).order('event_date'));
  },

  async addEvent(data) {
    const user = await Auth.currentUser();
    return _single('events', getClient().from('events').insert({ ...data, user_id: user.id }).select().single());
  },

  async deleteEvent(id) {
    const { error } = await getClient().from('events').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Scratch ────────────────────────────────────────────

  async getScratchItems() {
    const user = await Auth.currentUser();
    const today = new Date().toISOString().split('T')[0];
    return _select('scratch_items',
      getClient()
        .from('scratch_items')
        .select('*')
        .eq('user_id', user.id)
        .gte('item_date', today)   // today's items
        .order('created_at')
    );
  },

  async getScratchLogs() {
    const user = await Auth.currentUser();
    return _select('scratch_logs',
      getClient()
        .from('scratch_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('log_date', { ascending: false })
        .limit(30)
    );
  },

  async addScratchItem(text) {
    const user = await Auth.currentUser();
    return _single('scratch_items',
      getClient().from('scratch_items').insert({
        user_id:   user.id,
        text,
        item_date: new Date().toISOString().split('T')[0],
      }).select().single()
    );
  },

  async toggleScratchItem(id, done) {
    const { error } = await getClient().from('scratch_items').update({ done }).eq('id', id);
    if (error) throw error;
  },

  async deleteScratchItem(id) {
    const { error } = await getClient().from('scratch_items').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Dashboard ──────────────────────────────────────────

  async getCompletionHistory() {
    const user = await Auth.currentUser();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    return _select('completion_history',
      getClient()
        .from('completion_history')
        .select('*')
        .eq('user_id', user.id)
        .gte('log_date', sevenDaysAgo.toISOString().split('T')[0])
        .order('log_date')
    );
  },

  async recordCompletion() {
    const user = await Auth.currentUser();
    const today = new Date().toISOString().split('T')[0];
    const { error } = await getClient().from('completion_history').upsert({
      user_id:  user.id,
      log_date: today,
      count:    1,  // handled by DB increment below
    }, { onConflict: 'user_id,log_date', ignoreDuplicates: false });
    // Use a raw SQL increment to avoid race conditions
    await getClient().rpc('increment_completion', { p_user_id: user.id, p_date: today });
  },

  // ── Nudges ─────────────────────────────────────────────

  async getNudges() {
    const user = await Auth.currentUser();
    return _select('nudges',
      getClient()
        .from('nudges')
        .select('*, tasks(title)')
        .eq('user_id', user.id)
        .in('status', ['triggered', 'seen'])
        .order('triggered_at', { ascending: false })
    );
  },

  async dismissNudge(id) {
    const { error } = await getClient().from('nudges').update({ status: 'dismissed' }).eq('id', id);
    if (error) throw error;
  },

  async markNudgeSeen(id) {
    const { error } = await getClient().from('nudges').update({ status: 'seen', seen_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  // ── Realtime subscriptions ─────────────────────────────

  subscribeToTable(table, userId, callback) {
    return getClient()
      .channel(`public:${table}:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter: `user_id=eq.${userId}`,
      }, payload => callback(payload))
      .subscribe();
  },

  unsubscribe(channel) {
    getClient().removeChannel(channel);
  },
};

// ── SQL helper function (add this to Supabase SQL editor too) ──
// create or replace function public.increment_completion(p_user_id uuid, p_date date)
// returns void language plpgsql as $$
// begin
//   insert into public.completion_history (user_id, log_date, count)
//   values (p_user_id, p_date, 1)
//   on conflict (user_id, log_date)
//   do update set count = completion_history.count + 1;
// end;
// $$;