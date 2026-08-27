-- 문장학교 8월 정규수업 예약 표시 점검/복구 SQL
-- Supabase SQL Editor에서 실행해도 기존 예약 데이터는 삭제하지 않습니다.

alter table available_slots
add column if not exists is_open boolean default true;

alter table available_slots
alter column is_open set default true;

update available_slots
set is_open = true
where is_open is null;

-- 2026년 8월 예약 가능 시간이 이미 생성되어 있는데 is_open=false로 묶여 있는 경우 다시 엽니다.
-- 관리자에서 실제로 삭제한 슬롯은 행 자체가 삭제되어 있으므로 되살아나지 않습니다.
update available_slots
set is_open = true
where (start_at at time zone 'Asia/Seoul')::date >= date '2026-08-01'
  and (start_at at time zone 'Asia/Seoul')::date < date '2026-09-01';

create index if not exists available_slots_start_at_idx
on available_slots (start_at);

create index if not exists available_slots_is_open_start_at_idx
on available_slots (is_open, start_at);

-- 8월 슬롯이 실제로 있는지 확인용입니다. 결과가 0이면 관리자 페이지에서 8월 시간표를 다시 만들어야 합니다.
select
  to_char(start_at at time zone 'Asia/Seoul', 'YYYY-MM') as month,
  count(*) as slot_count,
  count(*) filter (where coalesce(is_open, true) = true) as open_slot_count
from available_slots
where (start_at at time zone 'Asia/Seoul')::date >= date '2026-07-01'
  and (start_at at time zone 'Asia/Seoul')::date < date '2026-09-01'
group by 1
order by 1;
