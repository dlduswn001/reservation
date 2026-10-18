-- Standardize only FUTURE weekend bookable starts; preserve rows and all confirmed bookings.
-- Sat/Sun: regular 10:00 / 13:00 / 14:40 (90-minute timetable slots);
-- lifestyle 12:00 / 16:30 (45 minutes).
--
-- Never open an entirely closed date. Only use dates with existing open weekend slots.
-- Preserve intentionally closed canonical rows and active historical booking references.
with active_dates as materialized (
  select distinct (start_at at time zone 'Asia/Seoul')::date as day
  from public.available_slots
  where start_at > now()
    and is_open is true
    and extract(isodow from start_at at time zone 'Asia/Seoul') in (6,7)
), times as (
  select v.time_key,v.duration_minutes from
    (values ('10:00',90),('12:00',45),('13:00',90),('14:40',90),('16:30',45)) v(time_key,duration_minutes)
)
insert into public.available_slots(start_at,end_at,is_open)
select (d.day::text||' '||t.time_key)::timestamp at time zone 'Asia/Seoul',
       ((d.day::text||' '||t.time_key)::timestamp at time zone 'Asia/Seoul') +
         make_interval(mins=>t.duration_minutes),
       true
from active_dates d cross join times t
where ((d.day::text||' '||t.time_key)::timestamp at time zone 'Asia/Seoul') > now()
on conflict(start_at) do nothing;

-- Old 30-minute starts must not remain available to any stale client.
-- Do not alter any already-confirmed booking, or its referenced row.
update public.available_slots s set is_open=false
where s.start_at>now()
 and s.is_open is true
 and extract(isodow from s.start_at at time zone 'Asia/Seoul') in (6,7)
 and to_char(s.start_at at time zone 'Asia/Seoul','HH24:MI')
   not in ('10:00','12:00','13:00','14:40','16:30')
 and not exists(
   select 1 from public.regular_bookings b where b.slot_id=s.id
   and b.status in ('booked','change_request','cancel_request')
 );

-- Ensure open canonical rows describe the correct timetable duration.
-- Active confirmed lesson rows are left untouched.
update public.available_slots s
set end_at=s.start_at + case
  when to_char(s.start_at at time zone 'Asia/Seoul','HH24:MI') in ('12:00','16:30')
    then interval '45 minutes'
  else interval '90 minutes' end
where s.start_at>now() and s.is_open is true
 and extract(isodow from s.start_at at time zone 'Asia/Seoul') in (6,7)
 and to_char(s.start_at at time zone 'Asia/Seoul','HH24:MI')
   in ('10:00','12:00','13:00','14:40','16:30')
 and not exists(
   select 1 from public.regular_bookings b where b.slot_id=s.id
   and b.status in ('booked','change_request','cancel_request')
 );
