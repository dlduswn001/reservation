-- Administrator-only content publishing ledger for 문장학교 운영 작업실.
-- This migration creates an isolated content table. It does not modify reservations or student records.
create extension if not exists pgcrypto;

create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 140),
  channel text not null check (channel in ('naver','place','instagram','brunch')),
  format text not null check (format in ('post','essay','cardnews','story','notice')),
  status text not null default 'idea' check (status in ('idea','draft','ready','published')),
  planned_date date,
  published_url text not null default '' check (length(published_url) <= 2000),
  keywords text not null default '' check (length(keywords) <= 1000),
  body text not null default '' check (length(body) <= 50000),
  notes text not null default '' check (length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_posts_planned_idx on public.content_posts (planned_date desc);
create index if not exists content_posts_channel_status_idx on public.content_posts (channel,status);

alter table public.content_posts enable row level security;
revoke all on public.content_posts from public, anon, authenticated;
grant select,insert,update,delete on public.content_posts to service_role;

comment on table public.content_posts is 'Private administrator content drafts, ideas, schedules, and published links. Never exposed to student clients.';
