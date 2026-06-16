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
