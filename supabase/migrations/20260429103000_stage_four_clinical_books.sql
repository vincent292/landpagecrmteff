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

