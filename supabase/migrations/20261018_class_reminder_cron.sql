-- Minute-level server-side reminders continue even when no student has the app open.
-- Supabase Postgres runs the reminder queue; the Edge dispatcher sends PWA push.
select cron.schedule(
  'munjang-class-three-hour-reminders',
  '* * * * *',
  $task$
    select public.munjang_enqueue_three_hour_reminders();
    select public.munjang_dispatch_pending_push();
  $task$
);