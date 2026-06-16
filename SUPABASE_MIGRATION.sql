-- 문장학교 예약 사이트 업데이트용 SQL
-- Supabase > SQL Editor > New query에 붙여넣고 Run을 눌러 주세요.

alter table students
add column if not exists lesson_credits integer not null default 0;

update students
set lesson_credits = 0
where lesson_credits is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_lesson_credits_nonnegative'
  ) then
    alter table students
    add constraint students_lesson_credits_nonnegative
    check (lesson_credits >= 0);
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table students to anon, authenticated, service_role;
grant select, insert, update, delete on table available_slots to anon, authenticated, service_role;
grant select, insert, update, delete on table regular_bookings to anon, authenticated, service_role;
grant select, insert, update, delete on table oneday_classes to anon, authenticated, service_role;
grant select, insert, update, delete on table oneday_bookings to anon, authenticated, service_role;

-- 이번 버전부터 실제 수업 시간은 80분으로 안내합니다.
-- 기존에 만들어둔 예약 가능 시간/예약 기록의 종료 시간을 80분 기준으로 맞춥니다.
update available_slots
set end_at = start_at + interval '80 minutes';

update regular_bookings
set end_at = start_at + interval '80 minutes';

-- 원데이 클래스 정원은 5명으로 운영합니다.
update oneday_classes
set capacity = 5;

-- 수강생별 과거 수강 기록을 저장하는 표입니다.
create table if not exists student_lesson_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  lesson_date timestamptz not null,
  title text not null,
  memo text,
  created_at timestamptz default now()
);

create index if not exists student_lesson_history_student_date_idx
on student_lesson_history (student_id, lesson_date desc);

alter table student_lesson_history enable row level security;
grant select, insert, update, delete on table student_lesson_history to anon, authenticated, service_role;

-- 원데이 클래스 신청 기록을 수강생 계정과 안정적으로 연결합니다.
alter table oneday_bookings
add column if not exists student_id uuid references students(id) on delete set null;

create index if not exists oneday_bookings_student_id_idx
on oneday_bookings (student_id);

-- 기존 신청 내역 중 이름과 핸드폰번호 뒷자리가 일치하는 기록을 연결합니다.
update oneday_bookings as ob
set student_id = s.id
from students as s
where ob.student_id is null
  and ob.student_name = s.name
  and ob.phone_last4 = s.phone_last4;

grant select, insert, update, delete on table oneday_bookings to anon, authenticated, service_role;
