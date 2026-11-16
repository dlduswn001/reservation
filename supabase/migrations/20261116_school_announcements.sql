-- Administrator-managed announcements visible to students in the booking app.
create table if not exists public.school_announcements (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 1 and 160),
 body text not null check(length(trim(body)) between 1 and 12000),
 is_published boolean not null default true,
 is_pinned boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.school_announcements enable row level security;
revoke all on public.school_announcements from public, anon, authenticated;
grant select,insert,update,delete on public.school_announcements to service_role;
create index if not exists school_announcements_public_idx on public.school_announcements(is_published,is_pinned,created_at desc);
comment on table public.school_announcements is 'Public notices authored only by authenticated administrators via server API.';
