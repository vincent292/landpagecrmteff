alter table public.treatments
  add column if not exists allows_direct_booking boolean not null default false,
  add column if not exists direct_booking_price numeric(12,2),
  add column if not exists direct_booking_label text;

create table if not exists public.service_feedback (
  id uuid primary key default gen_random_uuid(),
  patient_name text,
  patient_phone text,
  patient_email text,
  city text,
  treatment_name text,
  context_type text not null default 'general',
  context_title text,
  context_reference_id uuid,
  rating int not null,
  would_recommend boolean,
  comments text,
  source text not null default 'public_link',
  created_at timestamptz not null default now(),
  constraint service_feedback_rating_check check (rating between 1 and 5),
  constraint service_feedback_context_type_check check (context_type in ('general', 'treatment', 'promotion', 'appointment', 'other'))
);

create index if not exists service_feedback_created_at_idx
on public.service_feedback (created_at desc);

create index if not exists service_feedback_context_idx
on public.service_feedback (context_type, context_reference_id);

alter table public.service_feedback enable row level security;

drop policy if exists "Anyone can submit service feedback" on public.service_feedback;
create policy "Anyone can submit service feedback"
on public.service_feedback
for insert
with check (rating between 1 and 5);

drop policy if exists "Staff read service feedback" on public.service_feedback;
create policy "Staff read service feedback"
on public.service_feedback
for select
using (public.is_staff());

drop policy if exists "Staff manage service feedback" on public.service_feedback;
create policy "Staff manage service feedback"
on public.service_feedback
for all
using (public.is_staff())
with check (public.is_staff());
