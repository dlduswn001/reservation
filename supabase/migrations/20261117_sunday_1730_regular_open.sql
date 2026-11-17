-- Add the requested 17:30-19:00 Sunday regular starts for December 2026.
-- Additive only: never reopen existing closed slots, alter bookings, balances, or revenue.
-- Future months use buildTimetableSlots when the administrator opens that month.
with requested(day_key) as (
  values (date '2026-12-06'),
         (date '2026-12-13'),
         (date '2026-12-20'),
         (date '2026-12-27')
), sunday_open_dates as (
  select r.day_key
  from requested r
  where exists (
    select 1 from public.available_slots existing
    where (existing.start_at at time zone 'Asia/Seoul')::date = r.day_key
      and existing.is_open is true
  )
)
insert into public.available_slots (start_at, end_at, is_open)
select (d.day_key::text || ' 17:30')::timestamp at time zone 'Asia/Seoul',
       ((d.day_key::text || ' 17:30')::timestamp at time zone 'Asia/Seoul') + interval '90 minutes',
       true
from sunday_open_dates d
on conflict (start_at) do nothing;
