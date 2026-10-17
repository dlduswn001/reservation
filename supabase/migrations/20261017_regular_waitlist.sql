create table if not exists public.regular_waitlist (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.available_slots(id),
  student_id uuid not null references public.students(id),
  status text not null default 'waiting' check (status in ('waiting','cancelled','notified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists regular_waitlist_one_active_per_student
  on public.regular_waitlist (slot_id, student_id) where status = 'waiting';
create index if not exists regular_waitlist_queue_idx
  on public.regular_waitlist (slot_id, created_at, id) where status = 'waiting';
alter table public.regular_waitlist enable row level security;
revoke all on table public.regular_waitlist from anon, authenticated;
grant all on table public.regular_waitlist to service_role;

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

create or replace function public.munjang_regular_waitlist_cancel(p_wait_id uuid, p_student_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  update public.regular_waitlist
    set status='cancelled',updated_at=now()
    where id=p_wait_id and student_id=p_student_id and status='waiting'
    returning id into v_id;
  if v_id is null then raise exception '취소 가능한 대기 신청이 없습니다.'; end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.munjang_regular_waitlist_join(uuid,uuid) from public, anon, authenticated;
revoke all on function public.munjang_regular_waitlist_cancel(uuid,uuid) from public, anon, authenticated;
grant execute on function public.munjang_regular_waitlist_join(uuid,uuid) to service_role;
grant execute on function public.munjang_regular_waitlist_cancel(uuid,uuid) to service_role;
