-- 문장학교 수강권 재등록 10주 초기화 및 관리자 수강생 상태 수동 지정
-- Existing registrations, bookings, and pre-July initial enrolments are not backfilled by this migration.
-- Apply only after staging tests. Service-role admin APIs remain the sole writers.

alter table public.students
  add column if not exists manual_enrollment_status text;

do $$
begin
 if not exists (
   select 1 from pg_constraint
   where conname='students_manual_enrollment_status_check'
     and conrelid='public.students'::regclass
 ) then
   alter table public.students
     add constraint students_manual_enrollment_status_check
     check (manual_enrollment_status in ('active','paused','withdrawn'));
 end if;
end $$;

comment on column public.students.manual_enrollment_status is
  'Administrator override of active, paused or withdrawn; NULL means automatic enrolment classification.';

create or replace function public.munjang_record_registration(
 p_student_id uuid,
 p_date date,
 p_type text,
 p_amount_krw integer,
 p_credits_added numeric,
 p_memo text default ''
) returns uuid
language plpgsql
set search_path to ''
as $function$
declare v_payment_id uuid;
declare v_first_lesson date;
begin
  if p_type not in ('new','renewal')
      or p_date is null or p_amount_krw is null or p_amount_krw<0
      or p_credits_added is null or p_credits_added<0 or p_credits_added>1000
      or (p_amount_krw=0 and p_credits_added=0) then
    raise exception 'Invalid registration input';
  end if;

  perform 1 from public.students where id=p_student_id for update;
  if not found then raise exception 'Student does not exist'; end if;

  if p_credits_added>0 then
    if p_type='renewal' and p_date >= '2026-07-01'::date then
      -- Use the earliest still-valid reserved lesson of the NEW pass,
      -- even when the booking was made before the renewal payment was entered.
      select min((b.start_at at time zone 'Asia/Seoul')::date)
        into v_first_lesson
      from public.regular_bookings b
      where b.student_id=p_student_id
        and b.status in ('booked','done','change_request','cancel_request')
        and (b.start_at at time zone 'Asia/Seoul')::date >= p_date;

      update public.students
      set lesson_credits=lesson_credits+p_credits_added,
          pass_registered_at=p_date,
          pass_first_lesson_at=v_first_lesson,
          pass_expires_at=case when v_first_lesson is null then null else v_first_lesson+70 end,
          pass_extension_until=null,
          pass_extension_used=false,
          pass_extension_reason=null,
          is_active=true,
          manual_enrollment_status=case
            when manual_enrollment_status='withdrawn' then 'active'
            else manual_enrollment_status end
      where id=p_student_id;
    else
      -- Preserve existing initial-registration and historic pass behaviour.
      update public.students
      set lesson_credits=lesson_credits+p_credits_added,
          pass_registered_at=p_date,
          is_active=true
      where id=p_student_id;
    end if;
  end if;

  insert into public.student_registration_payments
    (student_id,payment_date,registration_type,amount_krw,credits_added,memo)
  values(p_student_id,p_date,p_type,p_amount_krw,p_credits_added,left(coalesce(p_memo,''),500))
  returning id into v_payment_id;
  return v_payment_id;
end;
$function$;
