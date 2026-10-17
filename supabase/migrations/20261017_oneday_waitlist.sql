-- Apply to the existing Supabase project before deploying the waitlist API.
-- Uses the existing oneday_bookings table: status='대기' is not counted toward 6 confirmed seats.
-- DB row-level locking of oneday_classes makes admission and promotion serialized per class.

create or replace function public.munjang_oneday_join_waitlist(
  p_class_id text, p_student_name text, p_phone_last4 text, p_people_count integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_class public.oneday_classes%rowtype;
  v_student public.students%rowtype;
  v_taken integer;
  v_waiting integer;
  v_status text;
  v_booking_id text;
begin
  if p_people_count not in (1,2) or p_phone_last4 !~ '^[0-9]{4}$' then
    raise exception '신청 인원이나 수강생 정보가 올바르지 않습니다.';
  end if;
  select * into v_student from public.students
    where name=trim(p_student_name) and phone_last4=p_phone_last4 and is_active=true limit 1;
  if not found then raise exception '정규수강생 정보가 일치하지 않습니다.'; end if;
  select * into v_class from public.oneday_classes
    where id::text=p_class_id and is_open=true for update;
  if not found then raise exception '신청 가능한 클래스가 아닙니다.'; end if;
  if v_class.start_at <= now() + interval '3 hours' then
    raise exception '신청은 수업 시작 3시간 전까지 가능합니다.';
  end if;
  if exists(select 1 from public.oneday_bookings
    where class_id=v_class.id and student_id=v_student.id
      and status in ('booked','입금대기','등록대기','입금완료','등록완료','대기')) then
    raise exception '이미 신청 또는 대기 중인 클래스입니다.';
  end if;
  select coalesce(sum(coalesce(people_count,1)),0) into v_taken
    from public.oneday_bookings where class_id=v_class.id
    and status in ('booked','입금대기','등록대기','입금완료','등록완료');
  select count(*) into v_waiting from public.oneday_bookings
    where class_id=v_class.id and status='대기';
  if v_waiting > 0 or v_taken + p_people_count > 6 then
    v_status := '대기';
  else
    v_status := '등록완료';
  end if;
  insert into public.oneday_bookings
    (class_id,student_id,student_name,phone_last4,people_count,is_regular_student,status,amount_due)
    values (v_class.id,v_student.id,trim(p_student_name),p_phone_last4,p_people_count,true,v_status,0)
    returning id::text into v_booking_id;
  if v_status='대기' then
    return jsonb_build_object('ok',true,'status',v_status,'waitlist_position',v_waiting+1,'booking_id',v_booking_id);
  end if;
  return jsonb_build_object('ok',true,'status',v_status,'waitlist_position',null,'booking_id',v_booking_id);
end $$;

create or replace function public.munjang_oneday_cancel_and_promote(
  p_booking_id text, p_student_name text, p_phone_last4 text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_class public.oneday_classes%rowtype;
  v_booking public.oneday_bookings%rowtype;
  v_candidate public.oneday_bookings%rowtype;
  v_taken integer;
  v_promoted integer := 0;
begin
  select * into v_booking from public.oneday_bookings where id::text=p_booking_id;
  if not found then raise exception '신청 내역을 찾을 수 없습니다.'; end if;
  select * into v_class from public.oneday_classes where id=v_booking.class_id for update;
  select * into v_booking from public.oneday_bookings where id::text=p_booking_id for update;
  if v_booking.student_name <> trim(p_student_name) or v_booking.phone_last4 <> p_phone_last4 then
    raise exception '신청자 정보가 일치하지 않습니다.';
  end if;
  if v_booking.status not in ('booked','입금대기','등록대기','입금완료','등록완료','대기') then
    raise exception '이미 취소된 신청입니다.';
  end if;
  if (v_class.start_at at time zone 'Asia/Seoul')::date <= (now() at time zone 'Asia/Seoul')::date then
    raise exception '수업 당일에는 취소할 수 없습니다.';
  end if;
  update public.oneday_bookings set status='cancelled' where id=v_booking.id;
  select coalesce(sum(coalesce(people_count,1)),0) into v_taken
    from public.oneday_bookings where class_id=v_class.id
    and status in ('booked','입금대기','등록대기','입금완료','등록완료');
  -- FIFO: do not allow later waiting students to jump ahead of a 2-seat request.
  for v_candidate in select * from public.oneday_bookings
    where class_id=v_class.id and status='대기' order by created_at asc,id asc for update
  loop
    if v_taken + coalesce(v_candidate.people_count,1) > 6 then exit; end if;
    update public.oneday_bookings set status='등록완료' where id=v_candidate.id;
    v_taken := v_taken + coalesce(v_candidate.people_count,1);
    v_promoted := v_promoted+1;
  end loop;
  return jsonb_build_object('ok',true,'promoted',v_promoted);
end $$;

revoke all on function public.munjang_oneday_join_waitlist(text,text,text,integer) from public, anon, authenticated;
revoke all on function public.munjang_oneday_cancel_and_promote(text,text,text) from public, anon, authenticated;
grant execute on function public.munjang_oneday_join_waitlist(text,text,text,integer) to service_role;
grant execute on function public.munjang_oneday_cancel_and_promote(text,text,text) to service_role;
