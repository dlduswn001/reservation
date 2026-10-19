-- Optional tuition for instructor-entered blocked/experience schedules.
-- Missing fee records mean calendar blocks, not revenue.
create table if not exists public.blocked_time_tuition (
  block_id uuid primary key references public.blocked_times(id) on delete cascade,
  amount_krw integer check (amount_krw between 0 and 2147483647),
  confirmed_at timestamptz,
  memo text not null default '' check (length(memo) <= 1000),
  updated_at timestamptz not null default clock_timestamp(),
  constraint confirmed_amount_required check (confirmed_at is null or amount_krw is not null)
);
alter table public.blocked_time_tuition enable row level security;
revoke all on public.blocked_time_tuition from public, anon, authenticated;
grant select, insert, update, delete on public.blocked_time_tuition to service_role;
comment on table public.blocked_time_tuition is 'Administrator-only optional tuition for manually entered lesson/schedule blocks; no fee means no revenue.';
