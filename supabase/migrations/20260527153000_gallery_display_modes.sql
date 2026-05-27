alter table public.gallery_albums
  add column if not exists display_mode text default 'carousel';

update public.gallery_albums
set display_mode = case
  when coalesce(category, '') = 'Antes y despues autorizados' then 'comparison'
  else 'carousel'
end
where display_mode is null;
