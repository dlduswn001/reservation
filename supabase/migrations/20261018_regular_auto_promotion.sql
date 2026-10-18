-- Auto-confirm a regular waitlist entry on a released time, with atomic credit deduction.
-- A waitlist entry has no credit charge until a confirmed booking is created.
alter table public.regular_waitlist
  add column if not exists preferred_lifestyle text
  check (preferred_lifestyle is null or preferred_lifestyle in ('1:1 서평생활','1:1 필사생활'));
alter table public.regular_waitlist
  add column if not exists confirmed_booking_id uuid references public.regular_bookings(id);

-- Prevent concurrent admissions (manual and automatic) from confirming overlapping classes.
-- Existing production records have been pre-checked for active overlaps.
alter table public.regular_bookings
  add constraint munjang_no_overlapping_regular_lessons
  exclude using gist (tstzrange(start_at,end_at,'[)') with &&)
  where (status in ('booked','change_request','cancel_request'));

create or replace function public.munjang_regular_waitlist_join_v2(
 p_slot_id uuid,p_student_id uuid,p_preferred_lifestyle text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_slot public.available_slots%rowtype;
  v_is_lifestyle boolean;
  v_result jsonb;
begin
  select * into v_slot from public.available_slots where id=p_slot_id;
  if not found then raise exception '수업 시간 정보를 찾을 수 없습니다.'; end if;
  v_is_lifestyle := (
    (extract(isodow from v_slot.start_at at time zone 'Asia/Seoul') between 1 and 5
      and to_char(v_slot.start_at at time zone 'Asia/Seoul','HH24:MI')='15:40')
    or
    (extract(isodow from v_slot.start_at at time zone 'Asia/Seoul') in (6,7)
      and to_char(v_slot.start_at at time zone 'Asia/Seoul','HH24:MI') in ('12:00','16:30'))
  );
  if v_is_lifestyle and coalesce(p_preferred_lifestyle,'') not in ('1:1 서평생활','1:1 필사생활') then
    raise exception '서평생활 또는 필사생활을 선택해 주세요.';
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

    expires := greatest(stu.pass_expires_at,stu.pass_extension_until);
    if expires is not null and (slot.start_at at time zone 'Asia/Seoul')::date > expires
       then continue; end if;

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
         set lesson_credits = lesson_credits - price
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
revoke all on function public.munjang_regular_promote_after_cancellation(uuid,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.munjang_regular_promote_after_cancellation(uuid,timestamptz,timestamptz)
  to service_role;

create or replace function public.munjang_regular_cancellation_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status in ('booked','change_request','cancel_request')
    and new.status='cancelled' then
    perform public.munjang_regular_promote_after_cancellation(old.slot_id,old.start_at,old.end_at);
  end if;
  return new;
end $$;
drop trigger if exists promote_regular_waitlist_after_cancel on public.regular_bookings;
create trigger promote_regular_waitlist_after_cancel
  after update of status on public.regular_bookings
  for each row execute function public.munjang_regular_cancellation_trigger();
