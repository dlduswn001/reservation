-- 문장학교 예약 사이트 업데이트용 SQL
-- Supabase > SQL Editor > New query에 붙여넣고 Run을 눌러 주세요.
-- 기존 수강생/예약/원데이 신청 데이터는 삭제하지 않습니다.

alter table students
add column if not exists lesson_credits numeric(8,2) not null default 0;

alter table students
alter column lesson_credits type numeric(8,2) using lesson_credits::numeric,
alter column lesson_credits set default 0;

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

-- 2026년 10월 1일부터 정규수업은 45분/90분 중심으로 운영하고, 120분 수강생은 별도 조율합니다.
-- 2026년 6월 30일까지는 기존대로 80분 수업 + 10분 휴식으로 운영합니다.
-- 기존 수강생은 기본값을 90분으로 둡니다.
alter table students
add column if not exists lesson_duration_minutes integer not null default 90;

update students
set lesson_duration_minutes = 90
where lesson_duration_minutes is null
   or lesson_duration_minutes not in (45, 90, 120);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_lesson_duration_valid'
  ) then
    alter table students
    add constraint students_lesson_duration_valid
    check (lesson_duration_minutes in (45, 90, 120));
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table students to anon, authenticated, service_role;
grant select, insert, update, delete on table available_slots to anon, authenticated, service_role;
grant select, insert, update, delete on table regular_bookings to anon, authenticated, service_role;
grant select, insert, update, delete on table oneday_classes to anon, authenticated, service_role;
grant select, insert, update, delete on table oneday_bookings to anon, authenticated, service_role;

-- 2026년 6월 30일까지의 예약 가능 시간과 정규수업 예약은 기존 규칙인 80분 수업으로 맞춥니다.
-- 데이터는 삭제하지 않고 종료 시간만 바로잡습니다.
update available_slots
set end_at = start_at + interval '80 minutes'
where (start_at at time zone 'Asia/Seoul')::date < date '2026-07-01';

update regular_bookings
set end_at = start_at + interval '80 minutes'
where (start_at at time zone 'Asia/Seoul')::date < date '2026-07-01';

-- 2026년 7월 1일부터 새 예약은 수강생별 90분/120분 수업시간으로 저장됩니다.

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



-- 정규수강생 원데이 클래스 혜택
-- 매월 첫 원데이 신청은 무료, 같은 달 두 번째 신청부터 10,000원으로 저장합니다.
alter table oneday_bookings
add column if not exists amount_due integer default 10000;

update oneday_bookings
set amount_due = 0
where amount_due is null
  and status = 'cancelled';

with active_bookings as (
  select
    ob.id,
    row_number() over (
      partition by ob.student_id, to_char(oc.start_at at time zone 'Asia/Seoul', 'YYYY-MM')
      order by oc.start_at asc, ob.created_at asc
    ) as monthly_order
  from oneday_bookings ob
  join oneday_classes oc on oc.id = ob.class_id
  where ob.status in ('booked', '입금대기', '등록대기', '입금완료', '등록완료')
    and ob.student_id is not null
)
update oneday_bookings ob
set amount_due = case when active_bookings.monthly_order = 1 then 0 else 10000 end
from active_bookings
where ob.id = active_bookings.id;

update oneday_bookings
set amount_due = 10000
where amount_due is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'oneday_bookings_amount_due_nonnegative'
  ) then
    alter table oneday_bookings
    add constraint oneday_bookings_amount_due_nonnegative
    check (amount_due >= 0);
  end if;
end $$;

grant select, insert, update, delete on table oneday_bookings to anon, authenticated, service_role;

-- 외부 예약/체험수업/상담/개인 일정으로 정규수업 예약을 막아두는 표입니다.
-- 관리자 페이지에서 1분 단위로 시작/종료 시간을 입력할 수 있습니다.
create table if not exists blocked_times (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  memo text,
  created_at timestamptz default now(),
  constraint blocked_times_valid_range check (start_at < end_at)
);

create index if not exists blocked_times_start_end_idx
on blocked_times (start_at, end_at);

alter table blocked_times enable row level security;
grant select, insert, update, delete on table blocked_times to anon, authenticated, service_role;

drop policy if exists "blocked_times_all_access" on blocked_times;
create policy "blocked_times_all_access"
on blocked_times
for all
using (true)
with check (true);

-- v13: 원데이 클래스 삭제 표시용 컬럼입니다.
-- 실제 신청자 기록은 보존하고, 관리자 목록/수강생 신청 화면에서는 사라지게 하기 위한 값입니다.
alter table oneday_classes
add column if not exists is_deleted boolean not null default false;

create index if not exists oneday_classes_is_deleted_start_at_idx
on oneday_classes (is_deleted, start_at);

-- v15: 2026년 8월 1일 이후 결제/재등록한 4회 정규수업 수강권 사용기한 관리
-- 기존 수강생은 pass_registered_at이 비어 있거나 2026-08-01 이전이면 정책 적용 전으로 처리됩니다.
alter table students
add column if not exists pass_registered_at date;

alter table students
add column if not exists pass_first_lesson_at date;

alter table students
add column if not exists pass_expires_at date;

alter table students
add column if not exists pass_extension_used boolean not null default false;

alter table students
add column if not exists pass_extension_until date;

alter table students
add column if not exists pass_extension_reason text;

create index if not exists students_pass_registered_at_idx
on students (pass_registered_at);

create index if not exists students_pass_expires_at_idx
on students (pass_expires_at);

-- 첫 수업일이 입력되어 있는데 만료일이 비어 있는 경우, 첫 수업일 + 8주로 채웁니다.
update students
set pass_expires_at = pass_first_lesson_at + 56
where pass_registered_at >= date '2026-08-01'
  and pass_first_lesson_at is not null
  and pass_expires_at is null;

-- v20: 8월 정규수업 예약 가능 시간 표시 안정화
alter table available_slots
add column if not exists is_open boolean default true;

update available_slots
set is_open = true
where is_open is null;

alter table available_slots
alter column is_open set default true;

create index if not exists available_slots_start_at_idx
on available_slots (start_at);

create index if not exists available_slots_is_open_start_at_idx
on available_slots (is_open, start_at);
