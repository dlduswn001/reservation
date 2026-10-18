-- Restore fixed instructor-safe weekend start times.
-- Preserve all booking, student, and historical waitlist records.
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

  if v_slot.is_open is distinct from true then raise exception '닫힌 수업 시간입니다.'; end if;
  if v_slot.start_at <= now() + interval '3 hours' then
    raise exception '수업 시작 3시간 전까지만 대기 신청할 수 있습니다.';
  end if;
  if not exists (
    select 1 from public.regular_bookings b
    where b.status in ('booked','change_request','cancel_request')
    and b.start_at < v_slot.start_at + (case
      when (extract(isodow from v_slot.start_at at time zone 'Asia/Seoul') between 1 and 5
        and to_char(v_slot.start_at at time zone 'Asia/Seoul','HH24:MI')='15:40')
        or (extract(isodow from v_slot.start_at at time zone 'Asia/Seoul') in (6,7)
          and to_char(v_slot.start_at at time zone 'Asia/Seoul','HH24:MI') in ('12:00','16:30'))
        then interval '45 minutes'
      when v_student.lesson_duration_minutes = 45 then interval '45 minutes'
      else interval '90 minutes' end)
    and b.end_at > v_slot.start_at
  ) then raise exception '현재 예약 가능한 시간입니다. 일반 예약을 이용해 주세요.'; end if;
  if exists(select 1 from public.regular_bookings b
    where b.student_id = p_student_id
    and b.status in ('booked','change_request','cancel_request')
    and b.start_at < v_slot.start_at + (case
      when (extract(isodow from v_slot.start_at at time zone 'Asia/Seoul') between 1 and 5
        and to_char(v_slot.start_at at time zone 'Asia/Seoul','HH24:MI')='15:40')
        or (extract(isodow from v_slot.start_at at time zone 'Asia/Seoul') in (6,7)
          and to_char(v_slot.start_at at time zone 'Asia/Seoul','HH24:MI') in ('12:00','16:30'))
        then interval '45 minutes'
      when v_student.lesson_duration_minutes = 45 then interval '45 minutes'
      else interval '90 minutes' end)
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
create or replace function public.munjang_regular_waitlist_join_v2(
 p_slot_id uuid,p_student_id uuid,p_preferred_lifestyle text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_slot public.available_slots%rowtype;
  v_is_lifestyle boolean;
  v_is_regular boolean;
  v_weekday integer;
  v_time text;
  v_result jsonb;
begin
  select * into v_slot from public.available_slots where id=p_slot_id;
  if not found or v_slot.is_open is distinct from true then
    raise exception '신청 가능한 수업 시간을 찾을 수 없습니다.';
  end if;
  v_weekday := extract(isodow from v_slot.start_at at time zone 'Asia/Seoul');
  v_time := to_char(v_slot.start_at at time zone 'Asia/Seoul','HH24:MI');
  v_is_lifestyle := (v_weekday between 1 and 5 and v_time='15:40')
    or (v_weekday in (6,7) and v_time in ('12:00','16:30'));
  v_is_regular := (v_weekday between 1 and 5
    and v_time in ('14:00','17:00','19:00','20:40'))
    or (v_weekday in (6,7) and v_time in ('10:00','13:00','14:40'));
  if not v_is_lifestyle and not v_is_regular then
    raise exception '문장학교 수업 시간표에 없는 시간입니다.';
  end if;
  if v_is_lifestyle and coalesce(p_preferred_lifestyle,'') not in ('1:1 서평생활','1:1 필사생활') then
    raise exception '이 시간은 서평생활 또는 필사생활 전용입니다.';
  end if;
  if v_is_regular and p_preferred_lifestyle is not null then
    raise exception '이 시간은 정규수업 전용입니다.';
  end if;
  v_result := public.munjang_regular_waitlist_join(p_slot_id,p_student_id);
  if v_is_lifestyle then
    update public.regular_waitlist set preferred_lifestyle=p_preferred_lifestyle
      where id=(v_result->>'id')::uuid;
  end if;
  return v_result;
end $$;
revoke all on function public.munjang_regular_waitlist_join_v2(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.munjang_regular_waitlist_join_v2(uuid,uuid,text) to service_role;
create or replace function public.munjang_regular_promote_after_cancellation(
 p_old_slot uuid,p_cancel_start timestamptz,p_cancel_end timestamptz
) returns integer language plpgsql security definer set search_path=public as $$
declare
  candidate record;
  stu public.students%rowtype;
  slot public.available_slots%rowtype;
  lifestyle boolean;
  new_end timestamptz;
  price numeric;
  new_booking uuid;
  chosen_name text;
  expires date;
begin
  if p_cancel_start <= now() + interval '3 hours' then return 0; end if;
  -- The earliest queue across affected starting times wins; only one booking is promoted.
  for candidate in
    select w.id,w.student_id,w.preferred_lifestyle,w.slot_id
      from public.regular_waitlist w
      join public.available_slots s on s.id=w.slot_id
      where w.status='waiting'
        and s.start_at < p_cancel_end
        and s.end_at > p_cancel_start
      order by w.created_at,w.id
      for update of w skip locked
  loop
    select * into slot from public.available_slots where id=candidate.slot_id for update;
    select * into stu from public.students where id=candidate.student_id for update;
    if not found or slot.is_open is distinct from true or stu.is_active is distinct from true
       or stu.lesson_duration_minutes not in (45,90)
       or slot.start_at <= now()+interval '3 hours' then continue; end if;

    -- A Monday/Tuesday must still be open through its admin date flag.
    if extract(isodow from slot.start_at at time zone 'Asia/Seoul') in (1,2)
     and (slot.start_at at time zone 'Asia/Seoul')::date not in
       ('2026-10-19'::date,'2026-10-20'::date,'2026-10-26'::date,'2026-10-27'::date)
     and not exists(
       select 1 from public.regular_weekday_open_dates d
       where d.date_key=(slot.start_at at time zone 'Asia/Seoul')::date
     ) then continue; end if;

    if stu.pass_registered_at >= date '2026-08-01' and stu.pass_first_lesson_at is not null then
      expires := coalesce(stu.pass_extension_until,stu.pass_expires_at,stu.pass_first_lesson_at+70);
      if expires is not null and (slot.start_at at time zone 'Asia/Seoul')::date > expires
        then continue; end if;
    end if;

    -- The five fixed weekend starts reserve the instructor's time independently.
    -- Legacy / manually inserted nonstandard slots cannot auto-confirm.
    if extract(isodow from slot.start_at at time zone 'Asia/Seoul') in (6,7) then
      if to_char(slot.start_at at time zone 'Asia/Seoul','HH24:MI')
        not in ('10:00','12:00','13:00','14:40','16:30') then continue; end if;
      if to_char(slot.start_at at time zone 'Asia/Seoul','HH24:MI') in ('12:00','16:30')
        and candidate.preferred_lifestyle not in ('1:1 서평생활','1:1 필사생활')
        then continue; end if;
      if to_char(slot.start_at at time zone 'Asia/Seoul','HH24:MI') in ('10:00','13:00','14:40')
        and candidate.preferred_lifestyle is not null then continue; end if;
    end if;
    lifestyle := (
      (extract(isodow from slot.start_at at time zone 'Asia/Seoul') between 1 and 5
       and to_char(slot.start_at at time zone 'Asia/Seoul','HH24:MI')='15:40')
      or
      (extract(isodow from slot.start_at at time zone 'Asia/Seoul') in (6,7)
       and to_char(slot.start_at at time zone 'Asia/Seoul','HH24:MI') in ('12:00','16:30'))
    );
    if lifestyle and candidate.preferred_lifestyle is null then continue; end if;
    new_end := slot.start_at + (case when lifestyle or stu.lesson_duration_minutes=45
                        then interval '45 minutes' else interval '90 minutes' end);
    price := case when lifestyle and stu.lesson_duration_minutes=90 then 0.5 else 1 end;
    if stu.lesson_credits < price then continue; end if;
    if exists(
      select 1 from public.regular_bookings b
       where b.status in ('booked','change_request','cancel_request')
         and tstzrange(b.start_at,b.end_at,'[)') && tstzrange(slot.start_at,new_end,'[)')
    ) then continue; end if;
    if exists(
      select 1 from public.blocked_times bt
       where tstzrange(bt.start_at,bt.end_at,'[)') && tstzrange(slot.start_at,new_end,'[)')
    ) then continue; end if;
    if exists(
      select 1 from public.oneday_classes c
       where c.is_open is true and
         (tstzrange(c.start_at,c.end_at,'[)') && tstzrange(slot.start_at,new_end,'[)')
          or (c.start_at >= new_end and c.start_at < new_end + interval '10 minutes'))
    ) then continue; end if;

    chosen_name := case when lifestyle then candidate.preferred_lifestyle else '정규수업' end;
    begin
      insert into public.regular_bookings(student_id,slot_id,start_at,end_at,status,memo)
        values(stu.id,slot.id,slot.start_at,new_end,'booked',
          '대기 자동 확정 / '||chosen_name||' / 수강권 '||price||'회 차감')
        returning id into new_booking;
      update public.students
         set lesson_credits = lesson_credits - price,
             pass_first_lesson_at = case
               when pass_registered_at >= date '2026-08-01' and pass_first_lesson_at is null
               then (slot.start_at at time zone 'Asia/Seoul')::date
               else pass_first_lesson_at end,
             pass_expires_at = case
               when pass_registered_at >= date '2026-08-01' and pass_first_lesson_at is null
               then (slot.start_at at time zone 'Asia/Seoul')::date + 70
               else pass_expires_at end
       where id = stu.id and lesson_credits >= price;
      if not found then raise exception '남은 수강권이 부족합니다.'; end if;
      update public.regular_waitlist
         set status='notified',updated_at=now(),confirmed_booking_id=new_booking
       where id=candidate.id and status='waiting';
      insert into public.student_notifications(student_id,kind,regular_booking_id,title,body,target_url)
        values(stu.id,'waitlist_confirmed',new_booking,'문장학교 대기 수업 예약 확정',
          '대기하셨던 '||to_char(slot.start_at at time zone 'Asia/Seoul','MM월 DD일 HH24:MI')||
          ' 수업이 확정되었습니다. 수강권 '||price||'회가 차감되었습니다.','/regular');
      return 1;
    exception when exclusion_violation or unique_violation then
      -- Concurrently filled times stay unconfirmed; preserve the cancelled booking transaction.
      continue;
    end;
  end loop;
  return 0;
end $$;
