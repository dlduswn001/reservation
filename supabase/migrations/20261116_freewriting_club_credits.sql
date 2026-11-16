-- Keep historic one-day bookings in place. Add a credit-based freewriting subtype.
alter table public.oneday_classes
  add column if not exists class_kind text not null default 'oneday';
alter table public.oneday_bookings
  add column if not exists credits_deducted numeric(5,2) not null default 0;
do $$
begin
 if not exists(select 1 from pg_constraint where conname='oneday_classes_class_kind_check' and conrelid='public.oneday_classes'::regclass) then
  alter table public.oneday_classes add constraint oneday_classes_class_kind_check check(class_kind in ('oneday','freewriting'));
 end if;
end $$;
-- Keep one unique club per calendar start. Historical one-day classes are unchanged.
create unique index if not exists one_freewriting_class_per_start
  on public.oneday_classes(start_at) where class_kind='freewriting';

-- Existing generic one-day RPCs are not a way to bypass prepaid club credit deduction.
revoke all on function public.munjang_oneday_join_waitlist(text,text,text,integer) from public, anon, authenticated;
grant execute on function public.munjang_oneday_join_waitlist(text,text,text,integer) to service_role;

-- This atomic RPC runs as service_role only, after the server checks the student's name and last 4 digits.
create or replace function public.munjang_freewriting_book(p_class_id uuid,p_student_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare
 c public.oneday_classes%rowtype;
 s public.students%rowtype;
 cost numeric(5,2);
 filled integer;
 new_id uuid;
 first_day date;
begin
 select * into c from public.oneday_classes where id=p_class_id and class_kind='freewriting' and is_open=true for update;
 if not found then raise exception '신청 가능한 클럽이 아닙니다.'; end if;
 if c.start_at <= now()+interval '3 hours' then raise exception '시작 3시간 전까지만 신청할 수 있습니다.'; end if;
 if c.capacity<>5 then raise exception '클럽 정원 설정을 확인해 주세요.'; end if;
 select * into s from public.students where id=p_student_id and is_active=true for update;
 if not found or s.manual_enrollment_status in ('paused','withdrawn') then
   raise exception '재원 수강생만 신청할 수 있습니다.';
 end if;
 if s.lesson_duration_minutes=45 then cost:=1;
 elsif s.lesson_duration_minutes=90 then cost:=0.5;
 else raise exception '120분 수강생은 이 클럽에 신청할 수 없습니다.';
 end if;
 if s.lesson_credits<cost then raise exception '잔여 수강권이 부족합니다.'; end if;
 first_day:=(c.start_at at time zone 'Asia/Seoul')::date;
 if s.pass_registered_at >= date '2026-07-01' and
    (s.pass_extension_until is not null and first_day>s.pass_extension_until
      or s.pass_extension_until is null and s.pass_expires_at is not null and first_day>s.pass_expires_at) then
   raise exception '수강권 사용기간이 만료되었습니다.';
 end if;
 if exists(select 1 from public.oneday_bookings b
     where b.class_id=c.id and (b.student_id=s.id or (b.student_name=s.name and b.phone_last4=s.phone_last4))
       and b.status in ('booked','등록완료','등록대기','입금대기','입금완료','대기')) then
   raise exception '이미 신청한 클럽입니다.';
 end if;
 if exists(select 1 from public.regular_bookings b
     where b.student_id=s.id and b.status in ('booked','change_request','cancel_request')
       and b.start_at<c.end_at and b.end_at>c.start_at) then
   raise exception '이미 예약한 정규수업과 시간이 겹칩니다.';
 end if;
 select coalesce(sum(coalesce(b.people_count,1)),0)::int into filled
 from public.oneday_bookings b where b.class_id=c.id and b.status in ('booked','등록완료','등록대기','입금대기','입금완료');
 if filled>=c.capacity then raise exception '신청 정원 5명이 마감되었습니다.'; end if;
 insert into public.oneday_bookings(class_id,student_id,student_name,phone_last4,people_count,
  is_regular_student,status,amount_due,expected_amount,paid_amount,registration_status,credits_deducted)
 values(c.id,s.id,s.name,s.phone_last4,1,true,'등록완료',0,0,0,'confirmed',cost)
 returning id into new_id;
 update public.students set
  lesson_credits=lesson_credits-cost,
  pass_first_lesson_at=case when pass_registered_at >= date '2026-07-01'
    and first_day>=pass_registered_at
    and (pass_first_lesson_at is null or pass_first_lesson_at<pass_registered_at or first_day<pass_first_lesson_at)
    then first_day else pass_first_lesson_at end,
  pass_expires_at=case when pass_registered_at >= date '2026-07-01'
    and first_day>=pass_registered_at
    and (pass_first_lesson_at is null or pass_first_lesson_at<pass_registered_at or first_day<pass_first_lesson_at)
    then first_day+70 else pass_expires_at end
 where id=s.id;
 return jsonb_build_object('ok',true,'booking_id',new_id,'credit_cost',cost,'remaining',s.lesson_credits-cost);
end;
$fn$;

create or replace function public.munjang_freewriting_cancel(p_booking_id uuid,p_student_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare b public.oneday_bookings%rowtype; c public.oneday_classes%rowtype;
begin
 select * into b from public.oneday_bookings where id=p_booking_id and student_id=p_student_id for update;
 if not found then raise exception '신청 내역을 찾지 못했습니다.'; end if;
 select * into c from public.oneday_classes where id=b.class_id and class_kind='freewriting' for update;
 if not found then raise exception '프리 라이팅 클럽 신청 내역이 아닙니다.'; end if;
 if b.status<>'등록완료' or b.credits_deducted<=0 then raise exception '이미 취소된 신청입니다.'; end if;
 if c.start_at<=now()+interval '3 hours' then raise exception '시작 3시간 전까지만 취소할 수 있습니다.'; end if;
 update public.oneday_bookings set status='취소완료',canceled_at=now(),updated_at=now() where id=b.id;
 update public.students set lesson_credits=lesson_credits+b.credits_deducted where id=b.student_id;
 return jsonb_build_object('ok',true,'refunded_credits',b.credits_deducted);
end;
$fn$;
revoke all on function public.munjang_freewriting_book(uuid,uuid) from public,anon,authenticated;
revoke all on function public.munjang_freewriting_cancel(uuid,uuid) from public,anon,authenticated;
grant execute on function public.munjang_freewriting_book(uuid,uuid) to service_role;
grant execute on function public.munjang_freewriting_cancel(uuid,uuid) to service_role;
