-- Match pass validity and first-lesson expiration policy used by the regular booking API.\ncreate or replace function public.munjang_regular_promote_after_cancellation(
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
