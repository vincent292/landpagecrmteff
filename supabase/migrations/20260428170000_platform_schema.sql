create type public.user_role as enum ('admin', 'assistant', 'patient', 'student');
create type public.request_status as enum ('new', 'contacted', 'scheduled', 'finished', 'discarded');
create type public.enrollment_status as enum ('pending', 'confirmed', 'cancelled', 'attended');
create type public.activity_type as enum ('Curso', 'Procedimiento', 'Cirugía', 'Presentación', 'Jornada', 'Valoración');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  city text,
  role public.user_role not null default 'patient',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.treatments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  short_description text,
  description text,
  image_url text,
  benefits text[] not null default '{}',
  duration text,
  before_after_care text[] not null default '{}',
  expected_results text[] not null default '{}',
  faqs jsonb not null default '[]'::jsonb,
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.treatment_images (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references public.treatments(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  old_price numeric,
  promo_price numeric,
  city text,
  valid_until date,
  spots int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.information_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  whatsapp text not null,
  city text,
  interest text not null,
  message text,
  contact_preference text,
  privacy_accepted boolean not null default false,
  status public.request_status not null default 'new',
  internal_notes text,
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  city text,
  date date,
  time time,
  modality text,
  price numeric,
  spots int,
  short_description text,
  description text,
  image_url text,
  syllabus text[] not null default '{}',
  requirements text[] not null default '{}',
  certification text,
  location text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.enrollment_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  unique(course_id, user_id)
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  city text,
  date date not null,
  time time,
  location text,
  type public.activity_type not null,
  description text,
  image_url text,
  spots int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  city text,
  date date,
  description text,
  cover_url text,
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  patient_name text,
  city text,
  quote text not null,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
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
alter table public.settings enable row level security;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('admin', 'assistant')
  );
$$;

create policy "Public can read active treatments" on public.treatments for select using (active = true);
create policy "Public can read treatment images" on public.treatment_images for select using (true);
create policy "Public can read active promotions" on public.promotions for select using (active = true);
create policy "Public can create information requests" on public.information_requests for insert with check (privacy_accepted = true);
create policy "Public can read active courses" on public.courses for select using (active = true);
create policy "Public can read active events" on public.calendar_events for select using (active = true);
create policy "Public can read active albums" on public.gallery_albums for select using (active = true);
create policy "Public can read gallery images" on public.gallery_images for select using (true);
create policy "Public can read active testimonials" on public.testimonials for select using (active = true);

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id or public.is_staff());
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can enroll themselves" on public.course_enrollments for insert with check (auth.uid() = user_id);
create policy "Users can read own enrollments" on public.course_enrollments for select using (auth.uid() = user_id or public.is_staff());

create policy "Staff can manage treatments" on public.treatments for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage treatment images" on public.treatment_images for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage promotions" on public.promotions for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage requests" on public.information_requests for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage courses" on public.courses for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage enrollments" on public.course_enrollments for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage events" on public.calendar_events for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage albums" on public.gallery_albums for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage gallery images" on public.gallery_images for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage testimonials" on public.testimonials for all using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage settings" on public.settings for all using (public.is_staff()) with check (public.is_staff());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'patient')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
