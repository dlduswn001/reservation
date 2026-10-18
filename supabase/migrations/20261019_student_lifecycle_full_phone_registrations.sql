-- Membership lifecycle, full phone and auditable registrations for admin only.
-- Do not update legacy bookings or pass credits in this migration.
alter table public.students
  add column if not exists phone_number text,
  add column if not exists credits_zero_since timestamptz,
  add column if not exists last_credit_refill_at timestamptz;

alter table public.students
  add constraint munjang_students_full_phone_digits
  check (phone_number is null or phone_number ~ '^01[016789][0-9]{7,8}$');

create or replace function public.munjang_students_credit_timestamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.lesson_credits <= 0 then
      new.credits_zero_since := coalesce(new.credits_zero_since, now());
    else
      new.credits_zero_since := null;
      new.last_credit_refill_at := coalesce(new.last_credit_refill_at,now());
    end if;
  else
    if new.lesson_credits > 0 then
      if old.lesson_credits is distinct from new.lesson_credits
          and new.lesson_credits > old.lesson_credits then
        new.last_credit_refill_at := now();
      end if;
      new.credits_zero_since := null;
    elsif old.lesson_credits > 0 then
      new.credits_zero_since := now();
    else
      new.credits_zero_since := coalesce(old.credits_zero_since,now());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists munjang_students_credit_timestamps_trg on public.students;
create trigger munjang_students_credit_timestamps_trg
before insert or update of lesson_credits on public.students
for each row execute function public.munjang_students_credit_timestamps();

-- No original zero-balance timestamp exists for legacy students. Start their
-- 7-day waiting clock at the migration date instead of retroactively expelling.
update public.students set credits_zero_since = now()
where lesson_credits = 0 and credits_zero_since is null;

create table if not exists public.student_registration_payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  payment_date date not null,
  registration_type text not null check(registration_type in ('new','renewal')),
  amount_krw integer not null check(amount_krw >= 0),
  credits_added numeric(8,2) not null check(credits_added >= 0),
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists munjang_registration_payments_date_idx
  on public.student_registration_payments(payment_date,registration_type);
create index if not exists munjang_registration_payments_student_idx
  on public.student_registration_payments(student_id,payment_date desc);
alter table public.student_registration_payments enable row level security;
revoke all on public.student_registration_payments from anon,authenticated;
grant select,insert,update,delete on public.student_registration_payments to service_role;

-- One server-side transaction for a genuine paid renewal or an explicitly
-- entered new-registration payment. A logged payment and credit addition
-- therefore cannot diverge when concurrent operations occur.
create or replace function public.munjang_record_registration(
  p_student_id uuid,
  p_date date,
  p_type text,
  p_amount_krw integer,
  p_credits_added numeric,
  p_memo text default ''
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_payment_id uuid;
begin
  if p_type not in ('new','renewal')
      or p_date is null or p_amount_krw is null or p_amount_krw < 0
      or p_credits_added is null or p_credits_added < 0
      or p_amount_krw=0 and p_credits_added=0
      or p_credits_added > 1000 then
    raise exception 'Invalid registration input';
  end if;
  -- Row locking avoids lost credits if booking or admin edits happen together.
  perform 1 from public.students where id=p_student_id for update;
  if not found then raise exception 'Student does not exist'; end if;

  if p_credits_added > 0 then
    update public.students
      set lesson_credits = lesson_credits + p_credits_added,
          pass_registered_at = p_date,
          is_active = true
    where id = p_student_id;
  end if;

  insert into public.student_registration_payments
    (student_id,payment_date,registration_type,amount_krw,credits_added,memo)
  values(p_student_id,p_date,p_type,p_amount_krw,p_credits_added,left(coalesce(p_memo,''),500))
  returning id into v_payment_id;
  return v_payment_id;
end $$;
revoke all on function public.munjang_record_registration(uuid,date,text,integer,numeric,text)
  from public,anon,authenticated;
grant execute on function public.munjang_record_registration(uuid,date,text,integer,numeric,text)
  to service_role;

-- Read-only, server-admin-only live status classification.
-- 0 credits for 7 FULL days => withdrawn. No attended class or enrollment
-- activity in 30 days => paused. Manual former withdrawals stay withdrawn.
-- Upcoming bookings do not count as lessons already attended.
create or replace function public.munjang_admin_student_statuses()
returns table(
  student_id uuid,
  enrollment_status text,
  last_attended_at timestamptz,
  credits_zero_since timestamptz
)
language sql stable security invoker set search_path = '' as $$
  with attended as (
    select b.student_id, max(b.end_at) as lesson_at
    from public.regular_bookings b
    where b.status='done' and b.end_at<=now()
    group by b.student_id
    union all
    select h.student_id,max(h.lesson_date) from public.student_lesson_history h
    where h.lesson_date<=now() group by h.student_id
    union all
    select j.student_id,max((j.lesson_date::timestamp+interval '12 hours')
      at time zone 'Asia/Seoul') from public.student_lesson_journals j
    where j.lesson_date <= (now() at time zone 'Asia/Seoul')::date group by j.student_id
  ),
  latest as (
    select a.student_id,max(a.lesson_at) as lesson_at from attended a group by a.student_id
  )
  select
    s.id,
    case
      when s.is_active=false then 'withdrawn'
      when s.lesson_credits=0 and s.credits_zero_since is not null
        and s.credits_zero_since<=now()-interval '7 days' then 'withdrawn'
      when greatest(
        coalesce(l.lesson_at,'epoch'::timestamptz),
        coalesce(s.last_credit_refill_at,'epoch'::timestamptz),
        coalesce(s.created_at,'epoch'::timestamptz),
        coalesce(s.pass_registered_at::timestamptz,'epoch'::timestamptz)
      ) <=now()-interval '30 days' then 'paused'
      else 'active'
    end,
    l.lesson_at,
    s.credits_zero_since
  from public.students s left join latest l on l.student_id=s.id;
$$;
revoke all on function public.munjang_admin_student_statuses() from public,anon,authenticated;
grant execute on function public.munjang_admin_student_statuses() to service_role;

-- Atomic creation of a student and optional first-payment ledger entry.
create or replace function public.munjang_admin_create_student(
  p_name text,
  p_phone_last4 text,
  p_phone_number text,
  p_initial_credits numeric,
  p_duration integer,
  p_registered_at date,
  p_paid_amount integer default 0
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if nullif(trim(p_name),'') is null
    or p_phone_last4 !~ '^\\d{4}$'
    or p_initial_credits < 0 or p_initial_credits > 1000
    or p_duration not in (45,90,120)
    or p_paid_amount < 0
    or (nullif(p_phone_number,'') is not null and
       (p_phone_number !~ '^01[016789][0-9]{7,8}$'
         or right(p_phone_number,4)<>p_phone_last4)) then
    raise exception 'Invalid student input';
  end if;
  insert into public.students (
    name,phone_last4,phone_number,lesson_credits,lesson_duration_minutes,
    pass_registered_at,is_active
  ) values(
    trim(p_name),p_phone_last4,nullif(p_phone_number,''),
    p_initial_credits,p_duration,p_registered_at,true
  ) returning id into v_id;

  if p_paid_amount > 0 then
    insert into public.student_registration_payments
      (student_id,payment_date,registration_type,amount_krw,credits_added)
    values(
      v_id,coalesce(p_registered_at,(now() at time zone 'Asia/Seoul')::date),
      'new',p_paid_amount,p_initial_credits
    );
  end if;
  return v_id;
end $$;
revoke all on function public.munjang_admin_create_student(text,text,text,numeric,integer,date,integer)
  from public,anon,authenticated;
grant execute on function public.munjang_admin_create_student(text,text,text,numeric,integer,date,integer)
  to service_role;
