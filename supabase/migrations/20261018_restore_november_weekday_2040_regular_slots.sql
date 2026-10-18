-- Fix November 2026 Wed/Thu/Fri 20:40 regular-class starts missing from
-- available_slots. The student app otherwise fabricates closed placeholders.
-- Preserve all existing reservations, intentionally closed starts, and Monday/
-- Tuesday closure; never override an existing slot row.
with working_days as (
  select (s.start_at at time zone 'Asia/Seoul')::date as class_day
  from public.available_slots s
  where s.is_open = true
    and (s.start_at at time zone 'Asia/Seoul')::date
      between date '2026-11-01' and date '2026-11-30'
    and extract(isodow from s.start_at at time zone 'Asia/Seoul') in (3,4,5)
    and to_char(s.start_at at time zone 'Asia/Seoul','HH24:MI') in ('14:00','19:00')
  group by (s.start_at at time zone 'Asia/Seoul')::date
  having count(distinct to_char(s.start_at at time zone 'Asia/Seoul','HH24:MI')) = 2
),
candidates as (
  select ((class_day::text || ' 20:40')::timestamp at time zone 'Asia/Seoul') as start_at
  from working_days
),
safe_candidates as (
  select c.start_at
  from candidates c
  where c.start_at > now() + interval '3 hours'
    and not exists (
      select 1 from public.regular_bookings b
      where b.status not in ('cancelled','late_cancelled')
        -- Allow at least 30 minutes after a booked lesson, if any.
        and b.start_at < c.start_at + interval '90 minutes'
        and b.end_at + interval '30 minutes' > c.start_at
    )
    and not exists (
      select 1 from public.blocked_times t
      where t.start_at < c.start_at + interval '90 minutes'
        and t.end_at > c.start_at
    )
    and not exists (
      select 1 from public.oneday_classes d
      where d.is_deleted is distinct from true
        and d.start_at < c.start_at + interval '90 minutes'
        and d.end_at > c.start_at
    )
)
insert into public.available_slots (start_at,end_at,is_open)
select start_at,start_at + interval '90 minutes',true
from safe_candidates
on conflict (start_at) do nothing;
