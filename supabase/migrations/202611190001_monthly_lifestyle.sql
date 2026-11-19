alter table public.regular_bookings add column if not exists lifestyle_free_month date;
create unique index if not exists one_lifestyle_benefit_per_month
on public.regular_bookings(student_id,lifestyle_free_month)
where lifestyle_free_month is not null and status <> 'cancelled';

create or replace function public.book_monthly_lifestyle(p_student uuid,p_slot uuid,p_title text)
returns jsonb language plpgsql set search_path = public as $$
declare
  learner students%rowtype;
  lesson available_slots%rowtype;
  month_key date;
  lesson_day date;
  cost numeric;
begin
  select * into strict learner from students where id=p_student and is_active and lesson_duration_minutes=120 for update;
  select * into strict lesson from available_slots where id=p_slot and is_open for update;
  lesson_day := (lesson.start_at at time zone 'Asia/Seoul')::date;
  month_key := date_trunc('month',lesson_day)::date;
  if lesson_day < date '2026-12-01' or p_title not in ('1:1 서평생활','1:1 필사생활') then
    raise exception '생활수업 예약 정보를 확인해 주세요.';
  end if;
  cost := case when exists(select from regular_bookings where student_id=p_student and lifestyle_free_month=month_key and status <> 'cancelled') then 0.5 else 0 end;
  if learner.lesson_credits < cost then raise exception '잔여 수강권이 부족합니다.'; end if;
  insert into regular_bookings(student_id,slot_id,start_at,end_at,status,memo,lifestyle_free_month)
  values(p_student,p_slot,lesson.start_at,lesson.start_at+interval '1 hour','booked',
    format('수강생 직접 예약 / %s / 60분 수업 / 수강권 %s회 차감',p_title,cost),
    case when cost=0 then month_key end);
  update students set lesson_credits=lesson_credits-cost where id=p_student;
  if learner.pass_registered_at >= date '2026-07-01' and lesson_day >= learner.pass_registered_at and
    (learner.pass_first_lesson_at is null or learner.pass_first_lesson_at < learner.pass_registered_at or learner.pass_first_lesson_at > lesson_day) then
    update students set pass_first_lesson_at=lesson_day,pass_expires_at=lesson_day+70 where id=p_student;
  end if;
  return jsonb_build_object('ok',true,'class_name',p_title,'credit_cost',cost,'lesson_credits',learner.lesson_credits-cost);
end $$;
revoke all on function public.book_monthly_lifestyle(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.book_monthly_lifestyle(uuid,uuid,text) to service_role;
