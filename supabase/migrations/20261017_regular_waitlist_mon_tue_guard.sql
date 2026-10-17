-- Match the regular waitlist admission rule to manually opened Mon/Tue.
-- Existing waitlist rows and bookings are not modified.
create or replace function public.munjang_regular_waitlist_join(p_slot_id uuid, p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot public.available_slots%rowtype;
  v_student public.students%rowtype;
  v_position integer;
  v_id uuid;
begin
  select * into v_student from public.students where id = p_student_id and is_active = true;
  if not found then raise exception '정규수강생 정보를 찾을 수 없습니다.'; end if;
  if v_student.lesson_duration_minutes = 120 then raise exception '120분 수업은 직접 일정을 조율해 주세요.'; end if;
  select * into v_slot from public.available_slots where id = p_slot_id for update;
  if not found then raise exception '수업 시간을 찾을 수 없습니다.'; end if;
  -- Only explicitly opened Monday/Tuesday dates can be waitlisted.
  IF extract(isodow from v_slot.start_at AT TIME ZONE 'Asia/Seoul') IN (1,2)
    AND (v_slot.start_at AT TIME ZONE 'Asia/Seoul')::date NOT IN
      (date '2026-10-19', date '2026-10-20', date '2026-10-26', date '2026-10-27')
  THEN
    IF v_slot.is_open IS DISTINCT FROM true
      OR NOT EXISTS(
        SELECT 1 FROM public.regular_weekday_open_dates d
        WHERE d.date_key = (v_slot.start_at AT TIME ZONE 'Asia/Seoul')::date
      )
      OR to_char(v_slot.start_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI')
        NOT IN ('14:00','15:40','17:00','19:00','20:40')
    THEN
      RAISE EXCEPTION '월·화요일 휴무일에는 대기 신청할 수 없습니다.';
    END IF;
  END IF;

  if v_slot.start_at <= now() + interval '3 hours' then
    raise exception '수업 시작 3시간 전까지만 대기 신청할 수 있습니다.';
  end if;
  if not exists (
    select 1 from public.regular_bookings b
    where b.status in ('booked','change_request','cancel_request')
    and b.start_at < v_slot.start_at + (case when v_student.lesson_duration_minutes = 45 then interval '45 minutes' else interval '90 minutes' end)
    and b.end_at > v_slot.start_at
  ) then raise exception '현재 예약 가능한 시간입니다. 일반 예약을 이용해 주세요.'; end if;
  if exists(select 1 from public.regular_bookings b
    where b.student_id = p_student_id
    and b.status in ('booked','change_request','cancel_request')
    and b.start_at < v_slot.start_at + (case when v_student.lesson_duration_minutes = 45 then interval '45 minutes' else interval '90 minutes' end)
    and b.end_at > v_slot.start_at)
  then raise exception '이미 같은 시간대의 수업을 예약했습니다.'; end if;
  if exists(select 1 from public.regular_waitlist
    where slot_id = p_slot_id and student_id = p_student_id and status='waiting')
  then raise exception '이미 대기 신청한 시간입니다.'; end if;
  insert into public.regular_waitlist (slot_id, student_id)
    values (p_slot_id, p_student_id) returning id into v_id;
  select count(*) into v_position from public.regular_waitlist
    where slot_id = p_slot_id and status='waiting'
    and (created_at, id) <= (
      select created_at, id from public.regular_waitlist where id=v_id
    );
  return jsonb_build_object('ok', true, 'id',v_id,'position',v_position);
end $$;
