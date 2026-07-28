-- v20: 8월 예약 가능 시간이 수강생 화면에 뜨지 않을 때 한 번 실행해 주세요.
-- 기존 예약/수강생/원데이 신청 기록은 삭제하지 않습니다.

-- 예전 버전에서 만들어진 예약 가능 시간이 is_open null 상태로 남아 있으면 열림으로 정리합니다.
alter table available_slots
add column if not exists is_open boolean default true;

update available_slots
set is_open = true
where is_open is null;

alter table available_slots
alter column is_open set default true;

-- 이미 8월 시간표를 만들었는데도 수강생 예약 화면에 보이지 않는 경우를 대비해
-- 2026년 8월 예약 가능 시간은 다시 열림 처리합니다.
-- 외부 차단/원데이/이미 예약된 시간은 앱 로직에서 계속 자동으로 숨겨집니다.
update available_slots
set is_open = true
where start_at >= timestamptz '2026-08-01 00:00:00+09'
  and start_at < timestamptz '2026-09-01 00:00:00+09';

create index if not exists available_slots_start_at_idx
on available_slots (start_at);

create index if not exists available_slots_is_open_start_at_idx
on available_slots (is_open, start_at);
