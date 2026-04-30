insert into storage.buckets (id, name, public)
values ('public-media', 'public-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read public-media" on storage.objects;
create policy "Public read public-media" on storage.objects
for select using (bucket_id = 'public-media');

drop policy if exists "Staff manage public-media" on storage.objects;
create policy "Staff manage public-media" on storage.objects
for all using (bucket_id = 'public-media' and public.is_staff())
with check (bucket_id = 'public-media' and public.is_staff());

alter table public.clinical_histories
  add column if not exists session_title text,
  add column if not exists session_date date not null default current_date;

create index if not exists clinical_histories_patient_date_idx
on public.clinical_histories(patient_id, session_date desc, created_at desc);

create table if not exists public.prescription_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  prescription_text text not null,
  indications text,
  category text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_care_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  treatment_name text,
  care_instructions text not null,
  warning_signs text,
  next_steps text,
  category text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_prescription_templates on public.prescription_templates;
create trigger touch_prescription_templates
before update on public.prescription_templates
for each row execute procedure public.touch_updated_at();

drop trigger if exists touch_post_care_templates on public.post_care_templates;
create trigger touch_post_care_templates
before update on public.post_care_templates
for each row execute procedure public.touch_updated_at();

alter table public.prescription_templates enable row level security;
alter table public.post_care_templates enable row level security;

drop policy if exists "Staff manage prescription templates" on public.prescription_templates;
create policy "Staff manage prescription templates" on public.prescription_templates
for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage post care templates" on public.post_care_templates;
create policy "Staff manage post care templates" on public.post_care_templates
for all using (public.is_staff()) with check (public.is_staff());
