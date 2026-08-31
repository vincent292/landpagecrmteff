-- Intereses comerciales por ciudad para segmentar futuras novedades de forma
-- consentida y sin inferir una ciudad a partir del número de WhatsApp.
create table if not exists public.crm_contact_city_interests (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  city text not null check (city in ('Cochabamba', 'La Paz', 'Santa Cruz', 'Sucre', 'Oruro', 'Potosi', 'Tarija', 'Beni', 'Pando')),
  source text not null default 'whatsapp_catalog',
  first_selected_at timestamptz not null default now(),
  last_selected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (contact_id, city)
);

create index if not exists crm_contact_city_interests_city_idx
  on public.crm_contact_city_interests(city, last_selected_at desc);

alter table public.crm_contact_city_interests enable row level security;

drop policy if exists "CRM managers manage city interests" on public.crm_contact_city_interests;
create policy "CRM managers manage city interests"
  on public.crm_contact_city_interests for all to authenticated
  using (public.is_crm_manager()) with check (public.is_crm_manager());

grant select, insert, update, delete on public.crm_contact_city_interests to authenticated;
