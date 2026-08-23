-- 문장학교 예약 화면 속도 개선용 인덱스
-- Supabase SQL Editor에서 한 번만 실행하면 됩니다.
-- 이미 같은 이름의 인덱스가 있으면 다시 만들지 않습니다.

create index if not exists idx_available_slots_open_start
on available_slots (is_open, start_at);

create index if not exists idx_regular_bookings_status_start_end
on regular_bookings (status, start_at, end_at);

create index if not exists idx_regular_bookings_status_end_start
on regular_bookings (status, end_at, start_at);

create index if not exists idx_oneday_classes_open_start_end
on oneday_classes (is_open, start_at, end_at);

create index if not exists idx_blocked_times_start_end
on blocked_times (start_at, end_at);
