alter table public.site_settings
  add column if not exists show_whatsapp_button boolean default false;

update public.site_settings
set show_whatsapp_button = false
where show_whatsapp_button is null;
