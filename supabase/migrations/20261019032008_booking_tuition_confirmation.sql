-- Deploy only after approval, before the application update.
-- Separate from registration revenue; never changes booking status or credits.
create table public.booking_tuition (
  booking_id uuid primary key references public.regular_bookings(id) on delete restrict,
  student_minutes integer,
  lesson_minutes numeric not null,
  amount_krw integer check (amount_krw >= 0),
  confirmed_at timestamptz,
  memo text not null default '' check (length(memo) <= 1000),
  updated_at timestamptz not null default clock_timestamp(),
  check (confirmed_at is null or amount_krw is not null)
);
alter table public.booking_tuition enable row level security;
revoke all on public.booking_tuition from public, anon, authenticated;
grant select, insert, update on public.booking_tuition to service_role;

create function public.munjang_default_booking_tuition(student_minutes integer, lesson_minutes numeric)
returns integer language sql immutable security invoker set search_path = ''
as $$
  select case
    when student_minutes = 90 and lesson_minutes = 90 then 65000
    when student_minutes = 45 and lesson_minutes = 45 then 40000
    when student_minutes = 90 and lesson_minutes = 45 then 32500
    else null end;
$$;
revoke all on function public.munjang_default_booking_tuition(integer,numeric) from public, anon, authenticated;
grant execute on function public.munjang_default_booking_tuition(integer,numeric) to service_role;

create function public.munjang_initialize_booking_tuition()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare student_duration integer;
declare duration numeric;
begin
  select s.lesson_duration_minutes into student_duration from public.students s where s.id = new.student_id;
  duration := extract(epoch from (new.end_at - new.start_at)) / 60;
  insert into public.booking_tuition(booking_id,student_minutes,lesson_minutes,amount_krw)
  values (new.id,student_duration,duration,
    public.munjang_default_booking_tuition(student_duration,duration));
  return new;
end;
$$;
revoke all on function public.munjang_initialize_booking_tuition() from public, anon, authenticated;
grant execute on function public.munjang_initialize_booking_tuition() to service_role;
create trigger initialize_booking_tuition after insert on public.regular_bookings
for each row execute function public.munjang_initialize_booking_tuition();

-- Existing future bookings use the current student type as their initial suggestion.
-- Past/cancelled bookings get a blank amount; no payment is ever inferred.
insert into public.booking_tuition(booking_id,student_minutes,lesson_minutes,amount_krw)
select b.id,s.lesson_duration_minutes,extract(epoch from (b.end_at-b.start_at))/60,
  case when b.start_at >= now() and b.status not in ('cancelled','late_cancelled')
    then public.munjang_default_booking_tuition(s.lesson_duration_minutes,extract(epoch from (b.end_at-b.start_at))/60)
    else null end
from public.regular_bookings b left join public.students s on s.id=b.student_id;
