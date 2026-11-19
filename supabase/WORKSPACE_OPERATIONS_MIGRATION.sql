-- 문장학교 작업실 전용 테이블. 예약/수강생 데이터는 변경하지 않습니다.
create table if not exists public.workspace_contents (
 id uuid primary key default gen_random_uuid(),
 channel text not null check (channel in ('blog','myplace','instagram','brunch')),
 kind text not null default '일반 게시물',
 title text not null check (char_length(title) between 1 and 200),
 body text not null default '',
 keywords text not null default '',
 status text not null default '아이디어' check (status in ('아이디어','초안','검토','발행 예정','발행 완료')),
 planned_on date,
 published_on date,
 published_url text not null default '',
 memo text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.workspace_manual_lessons (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(title) between 1 and 160),
 start_at timestamptz not null,
 end_at timestamptz not null,
 memo text not null default '',
 created_at timestamptz not null default now(),
 check (end_at > start_at)
);
create table if not exists public.workspace_sales (
 id uuid primary key default gen_random_uuid(),
 payment_on date not null,
 amount_krw integer not null check (amount_krw >= 0),
 category text not null default '기타 수입',
 memo text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.workspace_notes (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(title) between 1 and 160),
 body text not null default '',
 created_at timestamptz not null default now()
);
-- 서비스 역할로 접근하는 관리자 서버 API만 쿼리할 수 있도록 RLS 활성화.
-- anon/authenticated 정책은 생성하지 않습니다.
alter table public.workspace_contents enable row level security;
alter table public.workspace_manual_lessons enable row level security;
alter table public.workspace_sales enable row level security;
alter table public.workspace_notes enable row level security;
create index if not exists workspace_contents_planned_idx on public.workspace_contents(planned_on);
create index if not exists workspace_lessons_start_idx on public.workspace_manual_lessons(start_at);
create index if not exists workspace_sales_payment_idx on public.workspace_sales(payment_on);
