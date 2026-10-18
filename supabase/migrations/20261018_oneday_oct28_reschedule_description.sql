-- Change only the unbooked 2026-10-28 monthly class to 19:00–21:00 KST
-- and provide concise structured copy for the redesigned mobile class card.
-- No student credits, class applications, regular bookings or opening slots changed.
do $$
begin
  if exists (
    select 1
    from public.regular_bookings b
    where b.status not in ('cancelled','late_cancelled')
      and b.start_at < timestamptz '2026-10-28 21:00+09'
      and b.end_at > timestamptz '2026-10-28 19:00+09'
  ) or exists (
    select 1
    from public.blocked_times t
    where t.start_at < timestamptz '2026-10-28 21:00+09'
      and t.end_at > timestamptz '2026-10-28 19:00+09'
  ) or exists (
    select 1
    from public.oneday_bookings b
    where b.class_id = '94f0f19d-3b4b-4c2c-87c8-a96ab2576f5d'::uuid
  ) or exists (
    select 1 from public.oneday_classes other
    where other.id <> '94f0f19d-3b4b-4c2c-87c8-a96ab2576f5d'::uuid
      and other.is_open = true and other.is_deleted is distinct from true
      and other.start_at < timestamptz '2026-10-28 21:00+09'
      and other.end_at > timestamptz '2026-10-28 19:00+09'
  ) then
    raise exception 'Cannot reschedule: class has applications or another event overlaps';
  end if;

  update public.oneday_classes
  set start_at = timestamptz '2026-10-28 19:00+09',
      end_at = timestamptz '2026-10-28 21:00+09',
      description = '수업 소개
좋아하는 책 또는 읽고 싶은 책을 가져와 함께 이야기를 나눕니다.
책의 표지와 인상 깊은 문장을 살펴보고 십자수 도안을 정합니다.
책 표지 또는 종이 커버 위에 직접 십자수를 놓습니다. 처음이어도 괜찮아요!
완성한 책을 함께 감상하고 ‘오늘의 한 문장’을 남깁니다.

준비물
좋아하는 책 또는 읽고 싶은 책 1권
종이 재질의 표지 또는 분리 가능한 종이 커버가 있는 책

유의사항
표지를 훼손하고 싶지 않은 책은 피해 주세요.
천·비닐·두꺼운 코팅 재질의 표지는 바늘 작업이 어려우니 피해 주세요.'
  where id = '94f0f19d-3b4b-4c2c-87c8-a96ab2576f5d'::uuid
    and title = '문장학교 월간 클래스 | 한 권을 수놓는 밤'
    and start_at = timestamptz '2026-10-28 19:30+09'
    and end_at = timestamptz '2026-10-28 21:00+09'
    and is_deleted = false;
  if not found then
    raise exception 'Target class was modified or is missing; no changes made';
  end if;
end $$;