alter table public.site_settings
  add column if not exists reservation_reschedule_hours_before integer not null default 48;

update public.site_settings
set reservation_reschedule_hours_before = coalesce(reservation_reschedule_hours_before, 48)
where id = true;
