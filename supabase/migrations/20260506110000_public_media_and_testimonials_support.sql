alter table public.site_settings
  add column if not exists business_hours text;

alter table public.gallery_albums
  add column if not exists category text,
  add column if not exists video_url text,
  add column if not exists treatment_name text,
  add column if not exists is_public boolean default true;

alter table public.gallery_images
  add column if not exists media_type text default 'image',
  add column if not exists caption text,
  add column if not exists thumbnail_url text,
  add column if not exists display_order int default 0;

alter table public.testimonials
  add column if not exists treatment_name text,
  add column if not exists video_url text,
  add column if not exists sort_order int default 0;

update public.gallery_albums
set is_public = true
where is_public is null;
