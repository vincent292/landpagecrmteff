create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  city text,
  role text default 'user',
  created_at timestamp default now()
);

create table if not exists treatments (
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

create table if not exists treatment_images (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid references treatments(id) on delete cascade,
  image_url text,
  alt_text text,
  created_at timestamp default now()
);

create table if not exists promotions (
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

create table if not exists information_requests (
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

create table if not exists courses (
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

create table if not exists course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
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

create table if not exists calendar_events (
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

create table if not exists gallery_albums (
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

create table if not exists gallery_images (
  id uuid primary key default gen_random_uuid(),
  album_id uuid references gallery_albums(id) on delete cascade,
  image_url text,
  alt_text text,
  created_at timestamp default now()
);

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  city text,
  content text,
  rating int,
  image_url text,
  is_active boolean default true,
  created_at timestamp default now()
);

alter table profiles enable row level security;
alter table treatments enable row level security;
alter table treatment_images enable row level security;
alter table promotions enable row level security;
alter table information_requests enable row level security;
alter table courses enable row level security;
alter table course_enrollments enable row level security;
alter table calendar_events enable row level security;
alter table gallery_albums enable row level security;
alter table gallery_images enable row level security;
alter table testimonials enable row level security;

create or replace function is_admin_or_assistant()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('superadmin', 'doctor', 'admin')
  );
$$;

create or replace function is_superadmin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'superadmin'
  );
$$;

create policy "Visitors read active treatments" on treatments for select using (is_active = true);
create policy "Visitors read treatment images" on treatment_images for select using (true);
create policy "Visitors read active promotions" on promotions for select using (is_active = true);
create policy "Visitors create information requests" on information_requests for insert with check (true);
create policy "Visitors read active courses" on courses for select using (is_active = true);
create policy "Authenticated users enroll" on course_enrollments for insert with check (auth.uid() = user_id);
create policy "Users read own enrollments" on course_enrollments for select using (auth.uid() = user_id or is_admin_or_assistant());
create policy "Visitors read active events" on calendar_events for select using (is_active = true);
create policy "Visitors read active albums" on gallery_albums for select using (is_active = true);
create policy "Visitors read gallery images" on gallery_images for select using (true);
create policy "Visitors read active testimonials" on testimonials for select using (is_active = true);

create policy "Staff read profiles" on profiles for select using (is_admin_or_assistant());
create policy "Superadmin manage profiles" on profiles for all using (is_superadmin()) with check (is_superadmin());
create policy "Staff manage treatments" on treatments for all using (is_admin_or_assistant()) with check (is_admin_or_assistant());
create policy "Staff manage treatment images" on treatment_images for all using (is_admin_or_assistant()) with check (is_admin_or_assistant());
create policy "Staff manage promotions" on promotions for all using (is_admin_or_assistant()) with check (is_admin_or_assistant());
create policy "Staff manage requests" on information_requests for all using (is_admin_or_assistant()) with check (is_admin_or_assistant());
create policy "Staff manage courses" on courses for all using (is_admin_or_assistant()) with check (is_admin_or_assistant());
create policy "Staff manage enrollments" on course_enrollments for all using (is_admin_or_assistant()) with check (is_admin_or_assistant());
create policy "Staff manage events" on calendar_events for all using (is_admin_or_assistant()) with check (is_admin_or_assistant());
create policy "Staff manage albums" on gallery_albums for all using (is_admin_or_assistant()) with check (is_admin_or_assistant());
create policy "Staff manage gallery images" on gallery_images for all using (is_admin_or_assistant()) with check (is_admin_or_assistant());
create policy "Staff manage testimonials" on testimonials for all using (is_admin_or_assistant()) with check (is_admin_or_assistant());
