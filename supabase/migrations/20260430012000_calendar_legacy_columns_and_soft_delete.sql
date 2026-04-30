alter table public.calendar_events
  alter column title drop not null,
  alter column date drop not null,
  alter column type drop not null,
  alter column active drop not null;

update public.calendar_events
set
  event_date = coalesce(event_date, date),
  start_time = coalesce(start_time, time),
  event_type = coalesce(event_type, type::text),
  cover_image = coalesce(cover_image, image_url),
  available_slots = coalesce(available_slots, spots),
  is_active = coalesce(is_active, active, true)
where true;

create or replace function public.sync_calendar_event_legacy_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.event_date := coalesce(new.event_date, new.date);
  new.date := coalesce(new.date, new.event_date);
  new.start_time := coalesce(new.start_time, new.time);
  new.time := coalesce(new.time, new.start_time);
  new.event_type := coalesce(new.event_type, new.type::text, 'Jornada');
  new.cover_image := coalesce(new.cover_image, new.image_url);
  new.image_url := coalesce(new.image_url, new.cover_image);
  new.available_slots := coalesce(new.available_slots, new.spots);
  new.spots := coalesce(new.spots, new.available_slots);
  new.is_active := coalesce(new.is_active, new.active, true);
  new.active := coalesce(new.active, new.is_active, true);
  return new;
end;
$$;

drop trigger if exists sync_calendar_event_legacy_columns on public.calendar_events;
create trigger sync_calendar_event_legacy_columns
before insert or update on public.calendar_events
for each row execute function public.sync_calendar_event_legacy_columns();
