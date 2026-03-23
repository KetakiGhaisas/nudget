// supabase/functions/nudge-checker/index.ts
// Runs daily via Supabase cron (set up in Dashboard → Database → Cron Jobs)
// Cron schedule: 0 8 * * *  (8am UTC every day)
//
// What it does:
//   1. Finds all frequency-based tasks where last_completed_at is overdue
//   2. Creates a nudge row (status='triggered') for each
//   3. If a nudge has been in 'triggered' for > nudge_threshold_days, escalates it
//      by creating a new inbox task

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const now = new Date();
  const nowMs = now.getTime();

  // ── Step 1: find overdue frequency tasks ──
  const { data: freqTasks, error: ftErr } = await supabase
    .from('tasks')
    .select('id, user_id, title, freq_days, last_completed_at, created_at')
    .not('freq_days', 'is', null)
    .neq('gtd_state', 'done');

  if (ftErr) {
    console.error('nudge-checker: fetch freq tasks error', ftErr);
    return new Response('error', { status: 500 });
  }

  let nudgesCreated = 0;
  let escalated = 0;

  for (const task of freqTasks ?? []) {
    const lastDone = task.last_completed_at
      ? new Date(task.last_completed_at).getTime()
      : new Date(task.created_at).getTime();
    const daysSince = (nowMs - lastDone) / 86_400_000;

    if (daysSince < task.freq_days) continue; // not due yet

    // Check if a nudge already exists (avoid duplicates)
    const { data: existing } = await supabase
      .from('nudges')
      .select('id, status, triggered_at')
      .eq('task_id', task.id)
      .in('status', ['triggered', 'seen'])
      .maybeSingle();

    if (!existing) {
      // Create fresh nudge
      await supabase.from('nudges').insert({
        task_id: task.id,
        user_id: task.user_id,
        status: 'triggered',
      });
      nudgesCreated++;
    } else {
      // Get user's threshold preference
      const { data: user } = await supabase
        .from('users')
        .select('nudge_threshold_days')
        .eq('id', task.user_id)
        .single();

      const threshold = user?.nudge_threshold_days ?? 3;
      const nudgeAgeDays =
        (nowMs - new Date(existing.triggered_at).getTime()) / 86_400_000;

      if (nudgeAgeDays >= threshold) {
        // Escalate: create an inbox task
        await supabase.from('tasks').insert({
          user_id:   task.user_id,
          title:     task.title,
          gtd_state: 'inbox',
          energy:    'med',
          notes:     `Auto-escalated from frequency nudge after ${Math.round(daysSince)} days.`,
        });
        // Mark nudge as escalated
        await supabase
          .from('nudges')
          .update({ status: 'escalated', escalated_at: now.toISOString() })
          .eq('id', existing.id);
        escalated++;
      }
    }
  }

  console.log(`nudge-checker: ${nudgesCreated} nudges created, ${escalated} escalated`);
  return new Response(
    JSON.stringify({ nudgesCreated, escalated }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});