-- Structured teacher-only lesson journals.
-- Keep the existing student_lesson_history table and every past record intact.
create table if not exists public.student_lesson_journals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  booking_id uuid null references public.regular_bookings(id) on delete set null,
  lesson_date date not null,
  title text not null,
  lesson_summary text not null default '',
  feedback text not null default '',
  homework text not null default '',
  private_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_lesson_journals_title_not_blank check (length(btrim(title)) > 0)
);
create index if not exists student_lesson_journals_student_day_idx
  on public.student_lesson_journals(student_id,lesson_date desc,created_at desc);
create unique index if not exists student_lesson_journals_booking_id_key
  on public.student_lesson_journals(booking_id) where booking_id is not null;

-- No public/student read policy. Only the server-side, authenticated
-- administrator API (Supabase service role) may read and write journals.
alter table public.student_lesson_journals enable row level security;
revoke all on table public.student_lesson_journals from anon, authenticated;
grant select, insert, update, delete on table public.student_lesson_journals to service_role;
