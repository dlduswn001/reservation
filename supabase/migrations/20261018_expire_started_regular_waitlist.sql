-- Once a lesson begins, its waitlist is no longer active.
-- Keep history rows for audit, and do not affect confirmed bookings or lesson credits.
alter table public.regular_waitlist
  drop constraint if exists regular_waitlist_status_check;
alter table public.regular_waitlist
  add constraint regular_waitlist_status_check
  check (status in ('waiting','cancelled','notified','expired'));

create or replace function public.munjang_expire_regular_waitlist()
returns integer language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  update public.regular_waitlist w
    set status='expired', updated_at=now()
    from public.available_slots s
    where s.id=w.slot_id
      and w.status='waiting'
      and s.start_at <= now();
  get diagnostics changed = row_count;
  return changed;
end $$;
revoke all on function public.munjang_expire_regular_waitlist()
 from public,anon,authenticated;
grant execute on function public.munjang_expire_regular_waitlist()
 to service_role;

-- Keep waitlist history clean without any browser being open.
select cron.schedule(
  'munjang-expire-started-regular-waitlists',
  '* * * * *',
  $cron$ select public.munjang_expire_regular_waitlist(); $cron$
);
-- Clear already elapsed rows immediately.
select public.munjang_expire_regular_waitlist();
