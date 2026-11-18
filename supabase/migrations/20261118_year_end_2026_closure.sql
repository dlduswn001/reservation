-- 2026년 문장학교 연말 휴무: 12월 30일(수), 31일(목)
-- 실제 운영 데이터에는 이미 안전하게 적용된 설정을 GitHub에 기록하는 멱등 마이그레이션.
-- 기존 예약·대기·원데이 신청 및 수강권 내역을 삭제하거나 변경하지 않습니다.
begin;
do $holiday$
begin
  if exists (
    select 1 from public.regular_bookings b
    where (b.start_at at time zone 'Asia/Seoul')::date in (date '2026-12-30',date '2026-12-31')
      and b.status in ('booked','change_request','cancel_request')
  ) then raise exception 'Existing active booking prevents school holiday closure'; end if;
  if exists (
    select 1 from public.regular_waitlist w
      join public.available_slots s on s.id=w.slot_id
    where (s.start_at at time zone 'Asia/Seoul')::date in (date '2026-12-30',date '2026-12-31')
      and w.status='waiting'
  ) then raise exception 'Existing student waitlist prevents school holiday closure'; end if;
end;
$holiday$;

update public.available_slots set is_open=false
where (start_at at time zone 'Asia/Seoul')::date in (date '2026-12-30',date '2026-12-31')
  and is_open is distinct from false;

insert into public.blocked_times(title,start_at,end_at,memo)
select '연말 휴무', d::timestamp at time zone 'Asia/Seoul',
       (d+1)::timestamp at time zone 'Asia/Seoul',
       '문장학교 자체 휴무 · 2026년 12월 30–31일'
from (values (date '2026-12-30'), (date '2026-12-31')) as closed_day(d)
where not exists (
  select 1 from public.blocked_times b
  where b.title='연말 휴무' and b.start_at=d::timestamp at time zone 'Asia/Seoul'
);
commit;
