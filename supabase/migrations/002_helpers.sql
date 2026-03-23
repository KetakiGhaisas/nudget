-- ═══════════════════════════════════════════════════════════
-- NUDGET — HELPER FUNCTIONS
-- Run this in Supabase SQL Editor AFTER the main migration
-- ═══════════════════════════════════════════════════════════

-- Atomically increment task completion count for a user/day.
-- Called by DB.recordCompletion() in the client.
create or replace function public.increment_completion(p_user_id uuid, p_date date)
returns void language plpgsql security definer as $$
begin
  insert into public.completion_history (user_id, log_date, count)
  values (p_user_id, p_date, 1)
  on conflict (user_id, log_date)
  do update set count = completion_history.count + 1;
end;
$$;

-- ── Cron jobs (set up in Supabase Dashboard → Database → Cron Jobs) ──
-- Name: nudge-checker
-- Schedule: 0 8 * * *   (every day at 8am UTC)
-- Command:  select net.http_post('https://YOUR_PROJECT_REF.supabase.co/functions/v1/nudge-checker', '{}', 'application/json', array[('Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY')::http_header]);

-- Name: scratch-collapse
-- Schedule: 0 0 * * *   (every day at midnight UTC)
-- Command:  select net.http_post('https://YOUR_PROJECT_REF.supabase.co/functions/v1/scratch-collapse', '{}', 'application/json', array[('Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY')::http_header]);