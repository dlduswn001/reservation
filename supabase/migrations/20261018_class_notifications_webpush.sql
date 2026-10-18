-- Class reminders and waitlist-conversion notifications.
-- All data is protected by RLS; only server-side service role may access subscriptions.
create table if not exists public.student_notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('three_hour_regular','three_hour_oneday','waitlist_confirmed')),
  regular_booking_id uuid references public.regular_bookings(id) on delete set null,
  oneday_booking_id uuid references public.oneday_bookings(id) on delete set null,
  title text not null,
  body text not null,
  target_url text not null default '/regular',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_dispatched_at timestamptz,
  push_claimed_at timestamptz,
  push_attempts int not null default 0
);
create unique index if not exists unique_regular_class_notification
 on public.student_notifications(kind,regular_booking_id) where regular_booking_id is not null;
create unique index if not exists unique_oneday_class_notification
 on public.student_notifications(kind,oneday_booking_id) where oneday_booking_id is not null;
create index if not exists student_notifications_inbox
 on public.student_notifications(student_id,created_at desc);
create index if not exists student_notifications_unsent
 on public.student_notifications(created_at) where push_dispatched_at is null;
alter table public.student_notifications enable row level security;
revoke all on public.student_notifications from anon, authenticated;
grant all on public.student_notifications to service_role;

create table if not exists public.student_push_subscriptions (
  endpoint text primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_push_subscriptions_by_student
 on public.student_push_subscriptions(student_id);
alter table public.student_push_subscriptions enable row level security;
revoke all on public.student_push_subscriptions from anon, authenticated;
grant all on public.student_push_subscriptions to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Edge Function reads secrets through this RPC, exclusively with the service-role key.
create or replace function public.munjang_push_credentials()
returns jsonb language sql security definer set search_path=public, vault as $$
  select jsonb_build_object(
    'public_key',(select decrypted_secret from vault.decrypted_secrets where name='munjang_push_public' limit 1),
    'private_key',(select decrypted_secret from vault.decrypted_secrets where name='munjang_push_private' limit 1),
    'dispatch_token',(select decrypted_secret from vault.decrypted_secrets where name='munjang_push_dispatch_token' limit 1)
  )
$$;
revoke all on function public.munjang_push_credentials() from public,anon,authenticated;
grant execute on function public.munjang_push_credentials() to service_role;

-- Claim batch atomically; an expired claim can be retried after 2 minutes.
create or replace function public.munjang_claim_push_notifications(p_limit integer default 20)
returns setof public.student_notifications language plpgsql security definer
set search_path=public as $$
begin
  return query
  update public.student_notifications n
     set push_claimed_at=now(),push_attempts=n.push_attempts+1
   where n.id in (
     select x.id from public.student_notifications x
      where x.push_dispatched_at is null and x.push_attempts < 5
        and (x.push_claimed_at is null or x.push_claimed_at < now()-interval '2 minutes')
      order by x.created_at asc limit greatest(1,least(coalesce(p_limit,20),50))
      for update skip locked
   ) returning n.*;
end $$;
revoke all on function public.munjang_claim_push_notifications(integer) from public,anon,authenticated;
grant execute on function public.munjang_claim_push_notifications(integer) to service_role;

-- Send a lightweight asynchronous trigger to the Edge Function, not the VAPID private key.
create or replace function public.munjang_dispatch_pending_push()
returns bigint language plpgsql security definer set search_path=public,extensions,net,vault as $$
declare
  token text;
  request_id bigint;
begin
  select decrypted_secret into token from vault.decrypted_secrets
   where name='munjang_push_dispatch_token' limit 1;
  if token is null then return null; end if;
  select net.http_post(
    url:='https://jtktaduasruiauafaqzb.supabase.co/functions/v1/munjang-push-dispatch',
    headers:=jsonb_build_object('Content-Type','application/json','X-Munjang-Dispatch-Token',token),
    body:='{}'::jsonb,
    timeout_milliseconds:=10000
  ) into request_id;
  return request_id;
end $$;
revoke all on function public.munjang_dispatch_pending_push() from public,anon,authenticated;
grant execute on function public.munjang_dispatch_pending_push() to service_role;

create or replace function public.munjang_notification_wakeup()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.munjang_dispatch_pending_push();
  return new;
end $$;
drop trigger if exists notify_push_on_student_notification on public.student_notifications;
create trigger notify_push_on_student_notification after insert on public.student_notifications
  for each statement execute function public.munjang_notification_wakeup();

-- Queue up a reminder once the booking enters the <=3-hour-before window.
-- Runs every minute from Supabase Cron; skips cancellations and already notified bookings.
create or replace function public.munjang_enqueue_three_hour_reminders()
returns integer language plpgsql security definer set search_path=public as $$
declare inserted_regular integer; inserted_oneday integer;
begin
  insert into public.student_notifications(student_id,kind,regular_booking_id,title,body,target_url)
  select b.student_id,'three_hour_regular',b.id,
    '문장학교 수업 3시간 전',
    '오늘 '||to_char(b.start_at at time zone 'Asia/Seoul','HH24:MI')||
    '에 예약한 수업이 시작됩니다. 문장학교에서 만나요!',
    '/regular'
  from public.regular_bookings b
  where b.student_id is not null and b.status='booked'
    and b.start_at > now()+interval '2 hours 50 minutes'
    and b.start_at <= now()+interval '3 hours'
  on conflict do nothing;
  get diagnostics inserted_regular=row_count;

  insert into public.student_notifications(student_id,kind,oneday_booking_id,title,body,target_url)
  select b.student_id,'three_hour_oneday',b.id,
    '문장학교 원데이 클래스 3시간 전',
    '오늘 '||to_char(c.start_at at time zone 'Asia/Seoul','HH24:MI')||
    ' 원데이 클래스가 시작됩니다. 문장학교에서 만나요!',
    '/oneday'
  from public.oneday_bookings b
  join public.oneday_classes c on c.id=b.class_id
  where b.student_id is not null and b.status in ('등록완료','입금완료')
    and c.start_at > now()+interval '2 hours 50 minutes'
    and c.start_at <= now()+interval '3 hours'
  on conflict do nothing;
  get diagnostics inserted_oneday=row_count;
  return inserted_regular+inserted_oneday;
end $$;
revoke all on function public.munjang_enqueue_three_hour_reminders() from public,anon,authenticated;
grant execute on function public.munjang_enqueue_three_hour_reminders() to service_role;
