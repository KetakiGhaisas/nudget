// supabase/functions/scratch-collapse/index.ts
// Runs daily at midnight UTC via Supabase cron
// Cron schedule: 0 0 * * *
//
// What it does:
//   1. Counts each user's done scratch_items for yesterday
//   2. Writes a scratch_logs entry
//   3. Deletes done items (or all items if user prefers dismiss over rollover)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Get all done scratch items from yesterday
  const { data: doneItems } = await supabase
    .from('scratch_items')
    .select('id, user_id')
    .eq('done', true)
    .eq('item_date', yesterdayStr);

  if (!doneItems?.length) {
    return new Response(JSON.stringify({ collapsed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Group by user
  const byUser: Record<string, string[]> = {};
  for (const item of doneItems) {
    if (!byUser[item.user_id]) byUser[item.user_id] = [];
    byUser[item.user_id].push(item.id);
  }

  let total = 0;
  for (const [userId, ids] of Object.entries(byUser)) {
    // Upsert the daily log
    await supabase.from('scratch_logs').upsert({
      user_id:    userId,
      log_date:   yesterdayStr,
      done_count: ids.length,
    }, { onConflict: 'user_id,log_date' });

    // Delete done items
    await supabase.from('scratch_items').delete().in('id', ids);

    // If user prefers dismiss (not rollover), also delete incomplete items
    const { data: userPrefs } = await supabase
      .from('users')
      .select('scratch_rollover')
      .eq('id', userId)
      .single();

    if (!userPrefs?.scratch_rollover) {
      await supabase
        .from('scratch_items')
        .delete()
        .eq('user_id', userId)
        .eq('item_date', yesterdayStr)
        .eq('done', false);
    }

    total += ids.length;
  }

  console.log(`scratch-collapse: collapsed ${total} items across ${Object.keys(byUser).length} users`);
  return new Response(JSON.stringify({ collapsed: total }), {
    headers: { 'Content-Type': 'application/json' },
  });
});