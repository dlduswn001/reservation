-- 문장학교 관리자 통합 스케줄 v2 기능용 SQL
-- Supabase > SQL Editor > New query에 붙여넣고 Run을 눌러 주세요.
-- 기존 데이터는 삭제하지 않습니다.

-- 외부 예약/체험수업/상담/개인 일정으로 정규수업 예약을 막아두는 표입니다.
create table if not exists blocked_times (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  memo text,
  created_at timestamptz default now(),
  constraint blocked_times_valid_range check (start_at < end_at)
);

alter table blocked_times enable row level security;
grant select, insert, update, delete on table blocked_times to anon, authenticated, service_role;

drop policy if exists "blocked_times_all_access" on blocked_times;
create policy "blocked_times_all_access"
on blocked_times
for all
using (true)
with check (true);

-- 관리자가 정규수업 시간을 변경한 이력을 남기는 표입니다.
create table if not exists regular_booking_changes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid,
  old_start_at timestamptz,
  old_end_at timestamptz,
  new_start_at timestamptz not null,
  new_end_at timestamptz not null,
  memo text,
  created_at timestamptz default now(),
  constraint regular_booking_changes_valid_range check (new_start_at < new_end_at)
);

alter table regular_booking_changes enable row level security;
grant select, insert, update, delete on table regular_booking_changes to anon, authenticated, service_role;

drop policy if exists "regular_booking_changes_all_access" on regular_booking_changes;
create policy "regular_booking_changes_all_access"
on regular_booking_changes
for all
using (true)
with check (true);

-- 통합 스케줄 조회 속도 개선용 인덱스입니다.
create index if not exists blocked_times_start_end_idx
on blocked_times (start_at, end_at);

create index if not exists regular_bookings_start_end_status_idx
on regular_bookings (start_at, end_at, status);

create index if not exists regular_booking_changes_booking_idx
on regular_booking_changes (booking_id, created_at);

create index if not exists available_slots_open_start_end_idx
on available_slots (is_open, start_at, end_at);

create index if not exists oneday_classes_open_start_end_idx
on oneday_classes (is_open, start_at, end_at);

create index if not exists oneday_bookings_class_status_idx
on oneday_bookings (class_id, status);
