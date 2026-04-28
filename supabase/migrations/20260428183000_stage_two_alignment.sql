alter table public.profiles
  add column if not exists phone text,
  add column if not exists city text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role' and udt_name = 'user_role'
  ) then
    alter table public.profiles alter column role drop default;
    alter table public.profiles alter column role type text using role::text;
    alter table public.profiles alter column role set default 'patient';
  end if;
end $$;

alter table public.treatments
  add column if not exists cover_image text,
  add column if not exists is_featured boolean default false,
  add column if not exists is_active boolean default true,
  add column if not exists care_instructions text,
  add column if not exists expected_results text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'treatments' and column_name = 'benefits' and data_type = 'ARRAY'
  ) then
    alter table public.treatments alter column benefits type text using array_to_string(benefits, E'\n');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'treatments' and column_name = 'expected_results' and data_type = 'ARRAY'
  ) then
    alter table public.treatments alter column expected_results type text using array_to_string(expected_results, E'\n');
  end if;
end $$;

update public.treatments
set
  cover_image = coalesce(cover_image, image_url),
  is_featured = coalesce(is_featured, featured, false),
  is_active = coalesce(is_active, active, true),
  care_instructions = coalesce(care_instructions, array_to_string(before_after_care, E'\n')),
  expected_results = coalesce(expected_results, '')
where true;

alter table public.treatment_images
  add column if not exists alt_text text;

alter table public.promotions
  add column if not exists slug text,
  add column if not exists cover_image text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists available_slots int,
  add column if not exists is_active boolean default true;

update public.promotions
set
  slug = coalesce(slug, lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'))),
  cover_image = coalesce(cover_image, image_url),
  end_date = coalesce(end_date, valid_until),
  available_slots = coalesce(available_slots, spots),
  is_active = coalesce(is_active, active, true)
where true;

create unique index if not exists promotions_slug_key on public.promotions(slug);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'information_requests' and column_name = 'status' and udt_name = 'request_status'
  ) then
    alter table public.information_requests alter column status drop default;
    alter table public.information_requests alter column status type text using case status::text
      when 'new' then 'Nuevo'
      when 'contacted' then 'Contactado'
      when 'scheduled' then 'Agendado'
      when 'finished' then 'Finalizado'
      when 'discarded' then 'Descartado'
      else status::text
    end;
    alter table public.information_requests alter column status set default 'Nuevo';
  end if;
end $$;

alter table public.information_requests
  add column if not exists phone text,
  add column if not exists interest_type text,
  add column if not exists interest_id uuid,
  add column if not exists interest_title text;

update public.information_requests
set
  phone = coalesce(phone, whatsapp),
  interest_title = coalesce(interest_title, interest),
  interest_type = coalesce(interest_type, 'General')
where true;

alter table public.courses
  add column if not exists cover_image text,
  add column if not exists start_date date,
  add column if not exists start_time time,
  add column if not exists available_slots int,
  add column if not exists is_active boolean default true;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'courses' and column_name = 'syllabus' and data_type = 'ARRAY'
  ) then
    alter table public.courses alter column syllabus type text using array_to_string(syllabus, E'\n');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'courses' and column_name = 'requirements' and data_type = 'ARRAY'
  ) then
    alter table public.courses alter column requirements type text using array_to_string(requirements, E'\n');
  end if;
end $$;

update public.courses
set
  cover_image = coalesce(cover_image, image_url),
  start_date = coalesce(start_date, date),
  start_time = coalesce(start_time, time),
  available_slots = coalesce(available_slots, spots),
  is_active = coalesce(is_active, active, true)
where true;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'course_enrollments' and column_name = 'status' and udt_name = 'enrollment_status'
  ) then
    alter table public.course_enrollments alter column status drop default;
    alter table public.course_enrollments alter column status type text using case status::text
      when 'pending' then 'Pendiente'
      when 'confirmed' then 'Confirmado'
      when 'cancelled' then 'Cancelado'
      when 'attended' then 'Asistió'
      else status::text
    end;
    alter table public.course_enrollments alter column status set default 'Pendiente';
  end if;
end $$;

alter table public.course_enrollments
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists city text,
  add column if not exists profession text,
  add column if not exists payment_receipt_url text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calendar_events' and column_name = 'type' and udt_name = 'activity_type'
  ) then
    alter table public.calendar_events add column if not exists event_type text;
    update public.calendar_events set event_type = coalesce(event_type, type::text);
  end if;
end $$;

alter table public.calendar_events
  add column if not exists slug text,
  add column if not exists event_date date,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists cover_image text,
  add column if not exists available_slots int,
  add column if not exists is_active boolean default true;

update public.calendar_events
set
  slug = coalesce(slug, lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'))),
  event_date = coalesce(event_date, date),
  start_time = coalesce(start_time, time),
  cover_image = coalesce(cover_image, image_url),
  available_slots = coalesce(available_slots, spots),
  is_active = coalesce(is_active, active, true)
where true;

create unique index if not exists calendar_events_slug_key on public.calendar_events(slug);

alter table public.gallery_albums
  add column if not exists event_date date,
  add column if not exists cover_image text,
  add column if not exists is_featured boolean default false,
  add column if not exists is_active boolean default true;

update public.gallery_albums
set
  event_date = coalesce(event_date, date),
  cover_image = coalesce(cover_image, cover_url),
  is_featured = coalesce(is_featured, featured, false),
  is_active = coalesce(is_active, active, true)
where true;

alter table public.gallery_images
  add column if not exists alt_text text;

alter table public.testimonials
  add column if not exists full_name text,
  add column if not exists content text,
  add column if not exists rating int,
  add column if not exists is_active boolean default true;

update public.testimonials
set
  full_name = coalesce(full_name, patient_name),
  content = coalesce(content, quote),
  is_active = coalesce(is_active, active, true)
where true;

drop policy if exists "Public can create information requests" on public.information_requests;
create policy "Visitors can create information requests" on public.information_requests
for insert with check (true);
