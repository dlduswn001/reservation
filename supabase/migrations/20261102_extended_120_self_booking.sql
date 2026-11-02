-- Only opt-in 120-minute students can use the dedicated self-booking schedule.
-- Defaults false: all other 120-minute students continue to arrange classes directly.
-- Existing students, credits, bookings, and monthly opening dates are unchanged.
alter table public.students
  add column if not exists extended_self_booking_enabled boolean not null default false;

comment on column public.students.extended_self_booking_enabled is
  'Administrator opt-in for 120-minute self booking (Wed-Fri 14,17,19; Sat-Sun 10,13,14:40).';
