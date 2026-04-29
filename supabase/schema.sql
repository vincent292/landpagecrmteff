create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  city text,
  role text default 'patient',
  created_at timestamp default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  city text,
  birth_date date,
  gender text,
  emergency_contact text,
  notes text,
  created_at timestamp default now()
);

create unique index if not exists patients_profile_id_unique_idx
on public.patients(profile_id)
where profile_id is not null;

create table if not exists public.treatments (
  id uuid primary key default gen_random_uuid(),
  title text,
  slug text unique,
  short_description text,
  description text,
  benefits text,
  duration text,
  care_instructions text,
  expected_results text,
  cover_image text,
  city text,
  is_featured boolean default false,
  is_active boolean default true,
  created_at timestamp default now()
);

create table if not exists public.treatment_images (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid references public.treatments(id) on delete cascade,
  image_url text,
  alt_text text,
  created_at timestamp default now()
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text,
  slug text unique,
  description text,
  cover_image text,
  old_price numeric,
  promo_price numeric,
  city text,
  start_date date,
  end_date date,
  available_slots int,
  is_active boolean default true,
  created_at timestamp default now()
);

create table if not exists public.information_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  phone text,
  city text,
  interest_type text,
  interest_id uuid,
  interest_title text,
  contact_preference text,
  message text,
  status text default 'Nuevo',
  internal_notes text,
  created_at timestamp default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text,
  slug text unique,
  short_description text,
  description text,
  cover_image text,
  city text,
  start_date date,
  start_time time,
  modality text,
  price numeric,
  available_slots int,
  syllabus text,
  requirements text,
  certification text,
  is_active boolean default true,
  created_at timestamp default now()
);

create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  city text,
  profession text,
  status text default 'Pendiente',
  payment_receipt_url text,
  created_at timestamp default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text,
  slug text unique,
  city text,
  event_type text,
  event_date date,
  start_time time,
  end_time time,
  location text,
  description text,
  cover_image text,
  available_slots int,
  is_active boolean default true,
  created_at timestamp default now()
);

create table if not exists public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  title text,
  slug text unique,
  city text,
  event_date date,
  description text,
  cover_image text,
  is_featured boolean default false,
  is_active boolean default true,
  created_at timestamp default now()
);

create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  album_id uuid references public.gallery_albums(id) on delete cascade,
  image_url text,
  alt_text text,
  created_at timestamp default now()
);

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  city text,
  content text,
  rating int,
  image_url text,
  is_active boolean default true,
  created_at timestamp default now()
);

create table if not exists public.clinical_histories (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  reason_for_consultation text,
  medical_history text,
  allergies text,
  current_medications text,
  previous_procedures text,
  diagnosis text,
  observations text,
  internal_notes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.clinical_evolutions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  clinical_history_id uuid references public.clinical_histories(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text,
  description text,
  treatment_performed text,
  recommendations text,
  created_at timestamp default now()
);

create table if not exists public.patient_photos (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  clinical_history_id uuid references public.clinical_histories(id) on delete set null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  photo_type text,
  treatment_name text,
  image_path text,
  image_url text,
  notes text,
  is_visible_to_patient boolean default false,
  created_at timestamp default now()
);

create table if not exists public.photo_comparisons (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  before_photo_id uuid references public.patient_photos(id) on delete cascade,
  after_photo_id uuid references public.patient_photos(id) on delete cascade,
  treatment_name text,
  notes text,
  is_visible_to_patient boolean default false,
  created_at timestamp default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text,
  appointment_date date,
  start_time time,
  end_time time,
  city text,
  location text,
  status text default 'Programada',
  notes text,
  created_at timestamp default now()
);

create table if not exists public.patient_prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text,
  prescription_text text,
  indications text,
  is_visible_to_patient boolean default true,
  created_at timestamp default now()
);

create table if not exists public.post_treatment_cares (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text,
  treatment_name text,
  care_instructions text,
  warning_signs text,
  next_steps text,
  is_visible_to_patient boolean default true,
  created_at timestamp default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text,
  slug text unique,
  author text,
  description text,
  cover_image text,
  file_path text,
  price numeric,
  qr_payment_image text,
  download_token_mode text default 'single_use',
  default_token_max_uses int default 1,
  is_active boolean default true,
  created_at timestamp default now()
);

create table if not exists public.book_orders (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  city text,
  payment_receipt_path text,
  status text default 'Pendiente',
  admin_notes text,
  created_at timestamp default now(),
  verified_at timestamp
);

create table if not exists public.book_download_tokens (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade,
  order_id uuid references public.book_orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  token text unique,
  max_uses int default 1,
  used_count int default 0,
  expires_at timestamp,
  is_active boolean default true,
  created_at timestamp default now()
);

create table if not exists public.book_download_logs (
  id uuid primary key default gen_random_uuid(),
  token_id uuid references public.book_download_tokens(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  downloaded_at timestamp default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles alter column role set default 'patient';

create or replace function public.has_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = any (roles)
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(array['superadmin', 'doctor', 'admin', 'assistant']);
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(array['superadmin']);
$$;

create or replace function public.owns_patient(patient_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.patients
    where id = patient_uuid
      and profile_id = auth.uid()
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, city, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'patient')
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    city = excluded.city;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.sync_patient_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('patient', 'student', 'user') then
    insert into public.patients (profile_id, full_name, phone, email, city)
    values (new.id, coalesce(new.full_name, ''), new.phone, new.email, new.city)
    on conflict do nothing;

    update public.patients
    set
      full_name = coalesce(new.full_name, public.patients.full_name),
      phone = coalesce(new.phone, public.patients.phone),
      email = coalesce(new.email, public.patients.email),
      city = coalesce(new.city, public.patients.city)
    where profile_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_sync_patient on public.profiles;
create trigger on_profile_sync_patient
after insert or update on public.profiles
for each row execute procedure public.sync_patient_from_profile();

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.treatments enable row level security;
alter table public.treatment_images enable row level security;
alter table public.promotions enable row level security;
alter table public.information_requests enable row level security;
alter table public.courses enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.calendar_events enable row level security;
alter table public.gallery_albums enable row level security;
alter table public.gallery_images enable row level security;
alter table public.testimonials enable row level security;
alter table public.clinical_histories enable row level security;
alter table public.clinical_evolutions enable row level security;
alter table public.patient_photos enable row level security;
alter table public.photo_comparisons enable row level security;
alter table public.appointments enable row level security;
alter table public.patient_prescriptions enable row level security;
alter table public.post_treatment_cares enable row level security;
alter table public.books enable row level security;
alter table public.book_orders enable row level security;
alter table public.book_download_tokens enable row level security;
alter table public.book_download_logs enable row level security;

drop policy if exists "Own profile read" on public.profiles;
create policy "Own profile read" on public.profiles for select using (id = auth.uid() or public.is_staff());
drop policy if exists "Own profile update" on public.profiles;
create policy "Own profile update" on public.profiles for update using (id = auth.uid() or public.is_superadmin()) with check (id = auth.uid() or public.is_superadmin());
drop policy if exists "Superadmin manage profiles" on public.profiles;
create policy "Superadmin manage profiles" on public.profiles for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "Staff or owner read patients" on public.patients;
create policy "Staff or owner read patients" on public.patients for select using (public.is_staff() or profile_id = auth.uid());
drop policy if exists "Staff manage patients" on public.patients;
create policy "Staff manage patients" on public.patients for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Visitors read active treatments" on public.treatments;
create policy "Visitors read active treatments" on public.treatments for select using (is_active = true or public.is_staff());
drop policy if exists "Staff manage treatments" on public.treatments;
create policy "Staff manage treatments" on public.treatments for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Visitors read treatment images" on public.treatment_images;
create policy "Visitors read treatment images" on public.treatment_images for select using (true);
drop policy if exists "Staff manage treatment images" on public.treatment_images;
create policy "Staff manage treatment images" on public.treatment_images for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Visitors read active promotions" on public.promotions;
create policy "Visitors read active promotions" on public.promotions for select using (is_active = true or public.is_staff());
drop policy if exists "Staff manage promotions" on public.promotions;
create policy "Staff manage promotions" on public.promotions for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Visitors create information requests" on public.information_requests;
create policy "Visitors create information requests" on public.information_requests for insert with check (true);
drop policy if exists "Staff manage requests" on public.information_requests;
create policy "Staff manage requests" on public.information_requests for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Visitors read active courses" on public.courses;
create policy "Visitors read active courses" on public.courses for select using (is_active = true or public.is_staff());
drop policy if exists "Staff manage courses" on public.courses;
create policy "Staff manage courses" on public.courses for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Authenticated users enroll" on public.course_enrollments;
create policy "Authenticated users enroll" on public.course_enrollments for insert with check (auth.uid() = user_id);
drop policy if exists "Users read own enrollments" on public.course_enrollments;
create policy "Users read own enrollments" on public.course_enrollments for select using (auth.uid() = user_id or public.is_staff());
drop policy if exists "Staff manage enrollments" on public.course_enrollments;
create policy "Staff manage enrollments" on public.course_enrollments for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Visitors read active events" on public.calendar_events;
create policy "Visitors read active events" on public.calendar_events for select using (is_active = true or public.is_staff());
drop policy if exists "Staff manage events" on public.calendar_events;
create policy "Staff manage events" on public.calendar_events for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Visitors read active albums" on public.gallery_albums;
create policy "Visitors read active albums" on public.gallery_albums for select using (is_active = true or public.is_staff());
drop policy if exists "Visitors read gallery images" on public.gallery_images;
create policy "Visitors read gallery images" on public.gallery_images for select using (true);
drop policy if exists "Staff manage albums" on public.gallery_albums;
create policy "Staff manage albums" on public.gallery_albums for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Staff manage gallery images" on public.gallery_images;
create policy "Staff manage gallery images" on public.gallery_images for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Visitors read active testimonials" on public.testimonials;
create policy "Visitors read active testimonials" on public.testimonials for select using (is_active = true or public.is_staff());
drop policy if exists "Staff manage testimonials" on public.testimonials;
create policy "Staff manage testimonials" on public.testimonials for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage clinical histories" on public.clinical_histories;
create policy "Staff manage clinical histories" on public.clinical_histories for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Staff manage clinical evolutions" on public.clinical_evolutions;
create policy "Staff manage clinical evolutions" on public.clinical_evolutions for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage patient photos" on public.patient_photos;
create policy "Staff manage patient photos" on public.patient_photos for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Patient sees own visible photos" on public.patient_photos;
create policy "Patient sees own visible photos" on public.patient_photos for select using (public.owns_patient(patient_id) and is_visible_to_patient = true);
drop policy if exists "Staff manage photo comparisons" on public.photo_comparisons;
create policy "Staff manage photo comparisons" on public.photo_comparisons for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Patient sees own visible photo comparisons" on public.photo_comparisons;
create policy "Patient sees own visible photo comparisons" on public.photo_comparisons for select using (public.owns_patient(patient_id) and is_visible_to_patient = true);

drop policy if exists "Staff manage appointments" on public.appointments;
create policy "Staff manage appointments" on public.appointments for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Patient sees own appointments" on public.appointments;
create policy "Patient sees own appointments" on public.appointments for select using (public.owns_patient(patient_id));

drop policy if exists "Staff manage prescriptions" on public.patient_prescriptions;
create policy "Staff manage prescriptions" on public.patient_prescriptions for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Patient sees own visible prescriptions" on public.patient_prescriptions;
create policy "Patient sees own visible prescriptions" on public.patient_prescriptions for select using (public.owns_patient(patient_id) and is_visible_to_patient = true);

drop policy if exists "Staff manage post cares" on public.post_treatment_cares;
create policy "Staff manage post cares" on public.post_treatment_cares for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Patient sees own visible post cares" on public.post_treatment_cares;
create policy "Patient sees own visible post cares" on public.post_treatment_cares for select using (public.owns_patient(patient_id) and is_visible_to_patient = true);

drop policy if exists "Visitors read active books" on public.books;
create policy "Visitors read active books" on public.books for select using (is_active = true or public.is_staff());
drop policy if exists "Staff manage books" on public.books;
create policy "Staff manage books" on public.books for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Users create own book orders" on public.book_orders;
create policy "Users create own book orders" on public.book_orders for insert with check (auth.uid() = user_id);
drop policy if exists "Users read own book orders" on public.book_orders;
create policy "Users read own book orders" on public.book_orders for select using (auth.uid() = user_id or public.is_staff());
drop policy if exists "Users update own pending book orders" on public.book_orders;
create policy "Users update own pending book orders" on public.book_orders for update using (auth.uid() = user_id or public.is_staff()) with check (auth.uid() = user_id or public.is_staff());
drop policy if exists "Staff manage book orders" on public.book_orders;
create policy "Staff manage book orders" on public.book_orders for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Users read own tokens" on public.book_download_tokens;
create policy "Users read own tokens" on public.book_download_tokens for select using (auth.uid() = user_id or public.is_staff());
drop policy if exists "Users update own tokens for download" on public.book_download_tokens;
create policy "Users update own tokens for download" on public.book_download_tokens for update using (auth.uid() = user_id or public.is_staff()) with check (auth.uid() = user_id or public.is_staff());
drop policy if exists "Staff manage book tokens" on public.book_download_tokens;
create policy "Staff manage book tokens" on public.book_download_tokens for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Users insert own download logs" on public.book_download_logs;
create policy "Users insert own download logs" on public.book_download_logs for insert with check (auth.uid() = user_id or public.is_staff());
drop policy if exists "Users read own download logs" on public.book_download_logs;
create policy "Users read own download logs" on public.book_download_logs for select using (auth.uid() = user_id or public.is_staff());
drop policy if exists "Staff manage book download logs" on public.book_download_logs;
create policy "Staff manage book download logs" on public.book_download_logs for all using (public.is_staff()) with check (public.is_staff());

-- Stage: availability and conflict-safe reservations

create table if not exists public.doctor_availability_rules (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  city text not null,
  location text,
  appointment_type text not null,
  availability_type text not null default 'recurring',
  start_date date,
  end_date date,
  specific_date date,
  day_of_week int,
  start_time time not null,
  end_time time not null,
  slot_duration_minutes int default 30,
  break_minutes int default 0,
  capacity_per_slot int default 1,
  is_active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  constraint doctor_availability_type_check check (availability_type in ('recurring', 'specific')),
  constraint doctor_availability_time_check check (start_time < end_time),
  constraint doctor_availability_duration_check check (slot_duration_minutes > 0),
  constraint doctor_availability_break_check check (break_minutes >= 0),
  constraint doctor_availability_capacity_check check (capacity_per_slot > 0),
  constraint doctor_availability_day_check check (day_of_week is null or day_of_week between 0 and 6)
);

create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  city text,
  block_date date not null,
  start_time time,
  end_time time,
  reason text,
  is_active boolean default true,
  created_at timestamp default now(),
  constraint availability_blocks_time_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and start_time < end_time)
  )
);

create table if not exists public.appointment_reservations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  availability_rule_id uuid references public.doctor_availability_rules(id) on delete set null,
  title text,
  appointment_type text not null,
  city text not null,
  location text,
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  status text default 'Pendiente',
  source text default 'patient',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  constraint appointment_reservations_status_check check (status in ('Pendiente', 'Confirmada', 'Realizada', 'Cancelada', 'Rechazada')),
  constraint appointment_reservations_time_check check (start_time < end_time)
);

create index if not exists doctor_availability_rules_lookup_idx
on public.doctor_availability_rules (city, appointment_type, is_active, availability_type, day_of_week, specific_date);

create index if not exists availability_blocks_lookup_idx
on public.availability_blocks (block_date, city, is_active);

create index if not exists appointment_reservations_slot_idx
on public.appointment_reservations (appointment_date, city, appointment_type, start_time, end_time, status);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_doctor_availability_rules on public.doctor_availability_rules;
create trigger touch_doctor_availability_rules
before update on public.doctor_availability_rules
for each row execute procedure public.touch_updated_at();

drop trigger if exists touch_appointment_reservations on public.appointment_reservations;
create trigger touch_appointment_reservations
before update on public.appointment_reservations
for each row execute procedure public.touch_updated_at();

create or replace function public.get_available_slots(
  p_city text,
  p_appointment_type text,
  p_date_from date,
  p_date_to date
)
returns table (
  rule_id uuid,
  date date,
  start_time time,
  end_time time,
  city text,
  location text,
  appointment_type text,
  available_capacity int,
  total_capacity int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d date;
  rule_row public.doctor_availability_rules%rowtype;
  slot_start time;
  slot_end time;
  taken_count int;
  blocked boolean;
begin
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    return;
  end if;

  for d in
    select generate_series(p_date_from, p_date_to, interval '1 day')::date
  loop
    for rule_row in
      select *
      from public.doctor_availability_rules r
      where r.is_active = true
        and (p_city is null or p_city = '' or r.city = p_city)
        and (p_appointment_type is null or p_appointment_type = '' or r.appointment_type = p_appointment_type)
        and (
          (r.availability_type = 'specific' and r.specific_date = d)
          or (
            r.availability_type = 'recurring'
            and r.day_of_week = extract(dow from d)::int
            and (r.start_date is null or r.start_date <= d)
            and (r.end_date is null or r.end_date >= d)
          )
        )
    loop
      slot_start := rule_row.start_time;
      loop
        slot_end := ('2000-01-01'::date + slot_start + make_interval(mins => rule_row.slot_duration_minutes))::time;
        exit when slot_end > rule_row.end_time or slot_end <= slot_start;

        if d > current_date or (d = current_date and slot_start > current_time) then
          select exists (
            select 1
            from public.availability_blocks b
            where b.is_active = true
              and b.block_date = d
              and (b.city is null or b.city = rule_row.city)
              and (
                (b.start_time is null and b.end_time is null)
                or (slot_start < b.end_time and slot_end > b.start_time)
              )
          ) into blocked;

          if not blocked then
            select count(*)::int
            from public.appointment_reservations ar
            where ar.appointment_date = d
              and ar.city = rule_row.city
              and ar.appointment_type = rule_row.appointment_type
              and ar.start_time = slot_start
              and ar.end_time = slot_end
              and ar.status in ('Pendiente', 'Confirmada', 'Realizada')
            into taken_count;

            if taken_count < rule_row.capacity_per_slot then
              rule_id := rule_row.id;
              date := d;
              start_time := slot_start;
              end_time := slot_end;
              city := rule_row.city;
              location := rule_row.location;
              appointment_type := rule_row.appointment_type;
              available_capacity := rule_row.capacity_per_slot - taken_count;
              total_capacity := rule_row.capacity_per_slot;
              return next;
            end if;
          end if;
        end if;

        slot_start := ('2000-01-01'::date + slot_start + make_interval(mins => rule_row.slot_duration_minutes + rule_row.break_minutes))::time;
      end loop;
    end loop;
  end loop;
end;
$$;

create or replace function public.book_appointment_slot(
  p_user_id uuid,
  p_patient_id uuid,
  p_rule_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_city text,
  p_appointment_type text,
  p_notes text default null
)
returns public.appointment_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  rule_row public.doctor_availability_rules%rowtype;
  current_start time;
  current_end time;
  slot_matches boolean := false;
  blocked boolean := false;
  taken_count int := 0;
  created public.appointment_reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion para reservar.';
  end if;

  if auth.uid() <> p_user_id and not public.is_staff() then
    raise exception 'No tienes permiso para reservar por otro usuario.';
  end if;

  if not public.is_staff() and not exists (
    select 1 from public.patients where id = p_patient_id and profile_id = auth.uid()
  ) then
    raise exception 'No tienes permiso para este paciente.';
  end if;

  perform pg_advisory_xact_lock(hashtext(coalesce(p_rule_id::text, '') || p_date::text || p_city || p_appointment_type || p_start_time::text || p_end_time::text));

  select *
  into rule_row
  from public.doctor_availability_rules
  where id = p_rule_id
    and is_active = true
    and city = p_city
    and appointment_type = p_appointment_type
  for update;

  if not found then
    raise exception 'La disponibilidad seleccionada ya no esta activa.';
  end if;

  if not (
    (rule_row.availability_type = 'specific' and rule_row.specific_date = p_date)
    or (
      rule_row.availability_type = 'recurring'
      and rule_row.day_of_week = extract(dow from p_date)::int
      and (rule_row.start_date is null or rule_row.start_date <= p_date)
      and (rule_row.end_date is null or rule_row.end_date >= p_date)
    )
  ) then
    raise exception 'El horario no pertenece a esta disponibilidad.';
  end if;

  if p_date < current_date or (p_date = current_date and p_start_time <= current_time) then
    raise exception 'No puedes reservar un horario pasado.';
  end if;

  current_start := rule_row.start_time;
  loop
    current_end := ('2000-01-01'::date + current_start + make_interval(mins => rule_row.slot_duration_minutes))::time;
    exit when current_end > rule_row.end_time or current_end <= current_start;
    if current_start = p_start_time and current_end = p_end_time then
      slot_matches := true;
      exit;
    end if;
    current_start := ('2000-01-01'::date + current_start + make_interval(mins => rule_row.slot_duration_minutes + rule_row.break_minutes))::time;
  end loop;

  if not slot_matches then
    raise exception 'El horario seleccionado no es valido para esta disponibilidad.';
  end if;

  select exists (
    select 1
    from public.availability_blocks b
    where b.is_active = true
      and b.block_date = p_date
      and (b.city is null or b.city = p_city)
      and (
        (b.start_time is null and b.end_time is null)
        or (p_start_time < b.end_time and p_end_time > b.start_time)
      )
  ) into blocked;

  if blocked then
    raise exception 'Este horario fue bloqueado por administracion.';
  end if;

  select count(*)::int
  into taken_count
  from public.appointment_reservations ar
  where ar.appointment_date = p_date
    and ar.city = p_city
    and ar.appointment_type = p_appointment_type
    and ar.start_time = p_start_time
    and ar.end_time = p_end_time
    and ar.status in ('Pendiente', 'Confirmada', 'Realizada');

  if taken_count >= rule_row.capacity_per_slot then
    raise exception 'Este horario ya no esta disponible.';
  end if;

  insert into public.appointment_reservations (
    patient_id,
    user_id,
    availability_rule_id,
    title,
    appointment_type,
    city,
    location,
    appointment_date,
    start_time,
    end_time,
    status,
    source,
    notes,
    created_by
  )
  values (
    p_patient_id,
    p_user_id,
    p_rule_id,
    p_appointment_type,
    p_appointment_type,
    p_city,
    rule_row.location,
    p_date,
    p_start_time,
    p_end_time,
    'Pendiente',
    case when public.is_staff() then 'admin' else 'patient' end,
    p_notes,
    case when public.is_staff() then auth.uid() else null end
  )
  returning * into created;

  return created;
end;
$$;

alter table public.doctor_availability_rules enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.appointment_reservations enable row level security;

drop policy if exists "Visitors read active availability rules" on public.doctor_availability_rules;
create policy "Visitors read active availability rules" on public.doctor_availability_rules
for select using (is_active = true or public.is_staff());

drop policy if exists "Staff manage availability rules" on public.doctor_availability_rules;
create policy "Staff manage availability rules" on public.doctor_availability_rules
for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage availability blocks" on public.availability_blocks;
create policy "Staff manage availability blocks" on public.availability_blocks
for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Users read own appointment reservations" on public.appointment_reservations;
create policy "Users read own appointment reservations" on public.appointment_reservations
for select using (auth.uid() = user_id or public.is_staff());

drop policy if exists "Users create own appointment reservations" on public.appointment_reservations;
create policy "Users create own appointment reservations" on public.appointment_reservations
for insert with check (auth.uid() = user_id or public.is_staff());

drop policy if exists "Users cancel own appointment reservations" on public.appointment_reservations;
create policy "Users cancel own appointment reservations" on public.appointment_reservations
for update using ((auth.uid() = user_id and status in ('Pendiente', 'Confirmada')) or public.is_staff())
with check ((auth.uid() = user_id and status = 'Cancelada') or public.is_staff());

drop policy if exists "Staff manage appointment reservations" on public.appointment_reservations;
create policy "Staff manage appointment reservations" on public.appointment_reservations
for all using (public.is_staff()) with check (public.is_staff());

insert into storage.buckets (id, name, public)
values
  ('patient-photos-private', 'patient-photos-private', false),
  ('medical-files-private', 'medical-files-private', false),
  ('book-files-private', 'book-files-private', false),
  ('book-covers-public', 'book-covers-public', true),
  ('payment-receipts-private', 'payment-receipts-private', false),
  ('public-gallery', 'public-gallery', true)
on conflict (id) do nothing;

drop policy if exists "Public read public media buckets" on storage.objects;
create policy "Public read public media buckets" on storage.objects
for select using (bucket_id in ('book-covers-public', 'public-gallery'));

drop policy if exists "Staff manage clinical private storage" on storage.objects;
create policy "Staff manage clinical private storage" on storage.objects
for all using (bucket_id in ('patient-photos-private', 'medical-files-private') and public.is_staff())
with check (bucket_id in ('patient-photos-private', 'medical-files-private') and public.is_staff());

drop policy if exists "Staff manage book files storage" on storage.objects;
create policy "Staff manage book files storage" on storage.objects
for all using (bucket_id = 'book-files-private' and public.is_staff())
with check (bucket_id = 'book-files-private' and public.is_staff());

drop policy if exists "Staff manage public media storage" on storage.objects;
create policy "Staff manage public media storage" on storage.objects
for all using (bucket_id in ('book-covers-public', 'public-gallery') and public.is_staff())
with check (bucket_id in ('book-covers-public', 'public-gallery') and public.is_staff());

drop policy if exists "Authenticated upload payment receipts" on storage.objects;
create policy "Authenticated upload payment receipts" on storage.objects
for insert with check (bucket_id = 'payment-receipts-private');

drop policy if exists "Authenticated update own payment receipts" on storage.objects;
create policy "Authenticated update own payment receipts" on storage.objects
for update using (bucket_id = 'payment-receipts-private')
with check (bucket_id = 'payment-receipts-private');

drop policy if exists "Receipt owners and staff read payment receipts" on storage.objects;
create policy "Receipt owners and staff read payment receipts" on storage.objects
for select using (
  bucket_id = 'payment-receipts-private'
  and (
    public.is_staff()
    or exists (
      select 1
      from public.book_orders bo
      where bo.payment_receipt_path = storage.objects.name
        and bo.user_id = auth.uid()
    )
  )
);

drop policy if exists "Patients read visible clinical photos storage" on storage.objects;
create policy "Patients read visible clinical photos storage" on storage.objects
for select using (
  bucket_id = 'patient-photos-private'
  and exists (
    select 1
    from public.patient_photos pp
    join public.patients p on p.id = pp.patient_id
    where pp.image_path = storage.objects.name
      and pp.is_visible_to_patient = true
      and p.profile_id = auth.uid()
  )
);

drop policy if exists "Token owners read private book files storage" on storage.objects;
create policy "Token owners read private book files storage" on storage.objects
for select using (
  bucket_id = 'book-files-private'
  and exists (
    select 1
    from public.book_download_tokens t
    join public.books b on b.id = t.book_id
    where b.file_path = storage.objects.name
      and t.user_id = auth.uid()
      and t.is_active = true
      and t.used_count < t.max_uses
      and (t.expires_at is null or t.expires_at > now())
  )
);

create or replace function public.public_download_book_with_token(p_token text)
returns table (
  signed_file_path text,
  book_title text,
  token_value text,
  used_count int,
  max_uses int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.book_download_tokens%rowtype;
  book_row public.books%rowtype;
begin
  select *
  into token_row
  from public.book_download_tokens
  where token = upper(trim(p_token))
  for update;

  if not found then
    raise exception 'Token invalido o agotado.';
  end if;

  if token_row.is_active is not true
    or token_row.used_count >= token_row.max_uses
    or (token_row.expires_at is not null and token_row.expires_at <= now()) then
    raise exception 'Token invalido o agotado.';
  end if;

  select *
  into book_row
  from public.books
  where id = token_row.book_id
    and file_path is not null;

  if not found then
    raise exception 'El archivo del libro no esta disponible.';
  end if;

  update public.book_download_tokens
  set used_count = used_count + 1
  where id = token_row.id
  returning * into token_row;

  insert into public.book_download_logs (token_id, book_id, user_id)
  values (token_row.id, token_row.book_id, token_row.user_id);

  signed_file_path := book_row.file_path;
  book_title := book_row.title;
  token_value := token_row.token;
  used_count := token_row.used_count;
  max_uses := token_row.max_uses;
  return next;
end;
$$;

drop policy if exists "Public token download can read matching book files" on storage.objects;
create policy "Public token download can read matching book files" on storage.objects
for select using (
  bucket_id = 'book-files-private'
  and exists (
    select 1
    from public.book_download_tokens t
    join public.books b on b.id = t.book_id
    where b.file_path = storage.objects.name
      and t.is_active = true
      and t.used_count <= t.max_uses
      and (t.expires_at is null or t.expires_at > now())
  )
);


-- Public token download split

create or replace function public.public_download_book_with_token(p_token text)
returns table (
  signed_file_path text,
  book_title text,
  token_value text,
  used_count int,
  max_uses int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.book_download_tokens%rowtype;
  book_row public.books%rowtype;
begin
  select *
  into token_row
  from public.book_download_tokens
  where token = upper(trim(p_token));

  if not found
    or token_row.is_active is not true
    or token_row.used_count >= token_row.max_uses
    or (token_row.expires_at is not null and token_row.expires_at <= now()) then
    raise exception 'Token invalido o agotado.';
  end if;

  select *
  into book_row
  from public.books
  where id = token_row.book_id
    and file_path is not null;

  if not found then
    raise exception 'El archivo del libro no esta disponible.';
  end if;

  signed_file_path := book_row.file_path;
  book_title := book_row.title;
  token_value := token_row.token;
  used_count := token_row.used_count;
  max_uses := token_row.max_uses;
  return next;
end;
$$;

create or replace function public.public_consume_book_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.book_download_tokens%rowtype;
begin
  select *
  into token_row
  from public.book_download_tokens
  where token = upper(trim(p_token))
  for update;

  if not found
    or token_row.is_active is not true
    or token_row.used_count >= token_row.max_uses
    or (token_row.expires_at is not null and token_row.expires_at <= now()) then
    raise exception 'Token invalido o agotado.';
  end if;

  update public.book_download_tokens bdt
  set used_count = bdt.used_count + 1
  where bdt.id = token_row.id
  returning * into token_row;

  insert into public.book_download_logs (token_id, book_id, user_id)
  values (token_row.id, token_row.book_id, token_row.user_id);
end;
$$;

-- Public signed urls for token-based book flow

drop policy if exists "Public can create signed urls for private book files" on storage.objects;
create policy "Public can create signed urls for private book files" on storage.objects
for select using (bucket_id = 'book-files-private');
