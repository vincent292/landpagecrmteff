create table if not exists public.doctor_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  specialty text,
  bio text,
  city text,
  phone text,
  whatsapp text,
  email text,
  instagram_url text,
  tiktok_url text,
  photo_url text,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id boolean primary key default true,
  phone text,
  whatsapp text,
  email text,
  instagram_url text,
  tiktok_url text,
  address text,
  city text,
  maps_url text,
  maps_embed_url text,
  footer_text text,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id)
);

alter table public.patients
  add column if not exists assigned_doctor_id uuid references public.doctor_profiles(id) on delete set null;

alter table public.doctor_availability_rules
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null;

alter table public.appointment_reservations
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null;

create index if not exists doctor_profiles_profile_idx on public.doctor_profiles(profile_id);
create index if not exists patients_assigned_doctor_idx on public.patients(assigned_doctor_id);
create index if not exists availability_rules_doctor_idx on public.doctor_availability_rules(doctor_id);
create index if not exists appointment_reservations_doctor_idx on public.appointment_reservations(doctor_id);

drop trigger if exists touch_doctor_profiles on public.doctor_profiles;
create trigger touch_doctor_profiles
before update on public.doctor_profiles
for each row execute procedure public.touch_updated_at();

drop trigger if exists touch_site_settings on public.site_settings;
create trigger touch_site_settings
before update on public.site_settings
for each row execute procedure public.touch_updated_at();

insert into public.site_settings (
  id,
  phone,
  whatsapp,
  email,
  instagram_url,
  tiktok_url,
  address,
  city,
  maps_url,
  maps_embed_url,
  footer_text
)
values (
  true,
  null,
  null,
  null,
  null,
  null,
  'Consultorio principal',
  'Cochabamba',
  null,
  null,
  'Una experiencia clinica sobria, cercana y pensada para sentirse impecable en cualquier pantalla.'
)
on conflict (id) do nothing;

alter table public.doctor_profiles enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "Public read active doctor profiles" on public.doctor_profiles;
create policy "Public read active doctor profiles" on public.doctor_profiles
for select using (is_active = true or public.is_staff());

drop policy if exists "Staff manage doctor profiles" on public.doctor_profiles;
create policy "Staff manage doctor profiles" on public.doctor_profiles
for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Public read site settings" on public.site_settings;
create policy "Public read site settings" on public.site_settings
for select using (true);

drop policy if exists "Staff manage site settings" on public.site_settings;
create policy "Staff manage site settings" on public.site_settings
for all using (public.is_staff()) with check (public.is_staff());
