-- Reference photo gallery for One-day Classes.
-- Public image reads are intentional; writes are restricted to the
-- authenticated administrator API, which uses the Supabase service role.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'munjang-oneday-gallery','munjang-oneday-gallery',true,5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.oneday_class_images (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.oneday_classes(id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '',
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  constraint oneday_class_images_caption_length check (char_length(caption) <= 100)
);
create index if not exists oneday_class_images_class_sort
  on public.oneday_class_images(class_id,sort_order,id);
create unique index if not exists oneday_class_images_one_cover_per_class
  on public.oneday_class_images(class_id) where is_cover;

alter table public.oneday_class_images enable row level security;
revoke all on public.oneday_class_images from anon, authenticated;
grant select, insert, update, delete on public.oneday_class_images to service_role;

-- Reject accidental writes exceeding the 5 images per class limit.
create or replace function public.munjang_guard_oneday_gallery_size()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Serialize uploads to a single class even when multiple devices submit.
  perform 1 from public.oneday_classes where id = new.class_id for update;
  if (select count(*) from public.oneday_class_images where class_id = new.class_id) >= 5 then
    raise exception '원데이 클래스 이미지는 최대 5장까지 등록할 수 있습니다.';
  end if;
  return new;
end $$;
drop trigger if exists oneday_gallery_max_five on public.oneday_class_images;
create trigger oneday_gallery_max_five
  before insert on public.oneday_class_images
  for each row execute function public.munjang_guard_oneday_gallery_size();

-- No upload policies for anon/authenticated; server-side service_role bypasses
-- storage.objects RLS. Public objects are readable through the public URL
-- only after successful administrator uploads.
