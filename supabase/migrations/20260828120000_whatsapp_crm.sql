-- CRM omnicanal para WhatsApp Cloud API.
-- Los secretos de Meta/Gemini viven exclusivamente en el entorno del servidor.

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique,
  full_name text,
  phone text not null,
  email text,
  city text,
  lead_stage text not null default 'nuevo'
    check (lead_stage in ('nuevo', 'calificado', 'cita', 'pago', 'paciente', 'cerrado')),
  labels text[] not null default '{}',
  patient_id uuid references public.patients(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.crm_contacts(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  status text not null default 'abierta' check (status in ('abierta', 'pendiente', 'cerrada')),
  priority text not null default 'normal' check (priority in ('baja', 'normal', 'alta', 'urgente')),
  intent text,
  assigned_to uuid references public.profiles(id) on delete set null,
  appointment_reservation_id uuid references public.appointment_reservations(id) on delete set null,
  ai_enabled boolean not null default true,
  needs_human boolean not null default false,
  unread_count integer not null default 0 check (unread_count >= 0),
  customer_service_window_expires_at timestamptz,
  last_message_preview text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  meta_message_id text unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null default 'contact' check (sender_type in ('contact', 'agent', 'ai', 'system')),
  sender_profile_id uuid references public.profiles(id) on delete set null,
  message_type text not null default 'text',
  body text,
  media_id text,
  media_mime_type text,
  media_filename text,
  status text not null default 'received'
    check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'deleted')),
  error_code text,
  error_detail text,
  reply_to_meta_message_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.crm_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('website', 'instagram', 'facebook', 'tiktok', 'manual', 'platform')),
  source_url text,
  title text not null,
  content text not null,
  content_hash text,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  sync_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, title)
);

create table if not exists public.crm_settings (
  id boolean primary key default true check (id),
  ai_enabled boolean not null default true,
  ai_system_prompt text,
  welcome_message text,
  booking_url text not null default '/reservar-cita',
  handoff_keywords text[] not null default array['humano', 'persona', 'administradora', 'reclamo', 'emergencia'],
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.crm_settings (id)
values (true)
on conflict (id) do nothing;

create index if not exists crm_contacts_last_message_idx on public.crm_contacts(last_message_at desc);
create index if not exists crm_conversations_last_message_idx on public.crm_conversations(last_message_at desc);
create index if not exists crm_conversations_status_idx on public.crm_conversations(status, needs_human, last_message_at desc);
create index if not exists crm_messages_conversation_idx on public.crm_messages(conversation_id, occurred_at);
create index if not exists crm_messages_meta_idx on public.crm_messages(meta_message_id) where meta_message_id is not null;

create or replace function public.crm_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_contacts_touch_updated_at on public.crm_contacts;
create trigger crm_contacts_touch_updated_at before update on public.crm_contacts
for each row execute function public.crm_touch_updated_at();

drop trigger if exists crm_conversations_touch_updated_at on public.crm_conversations;
create trigger crm_conversations_touch_updated_at before update on public.crm_conversations
for each row execute function public.crm_touch_updated_at();

drop trigger if exists crm_knowledge_touch_updated_at on public.crm_knowledge_sources;
create trigger crm_knowledge_touch_updated_at before update on public.crm_knowledge_sources
for each row execute function public.crm_touch_updated_at();

drop trigger if exists crm_settings_touch_updated_at on public.crm_settings;
create trigger crm_settings_touch_updated_at before update on public.crm_settings
for each row execute function public.crm_touch_updated_at();

create or replace function public.is_crm_manager()
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
      and role in ('superadmin', 'admin')
  );
$$;

alter table public.crm_contacts enable row level security;
alter table public.crm_conversations enable row level security;
alter table public.crm_messages enable row level security;
alter table public.crm_knowledge_sources enable row level security;
alter table public.crm_settings enable row level security;

drop policy if exists "CRM managers manage contacts" on public.crm_contacts;
create policy "CRM managers manage contacts" on public.crm_contacts
for all using (public.is_crm_manager()) with check (public.is_crm_manager());

drop policy if exists "CRM managers manage conversations" on public.crm_conversations;
create policy "CRM managers manage conversations" on public.crm_conversations
for all using (public.is_crm_manager()) with check (public.is_crm_manager());

drop policy if exists "CRM managers manage messages" on public.crm_messages;
create policy "CRM managers manage messages" on public.crm_messages
for all using (public.is_crm_manager()) with check (public.is_crm_manager());

drop policy if exists "CRM managers manage knowledge" on public.crm_knowledge_sources;
create policy "CRM managers manage knowledge" on public.crm_knowledge_sources
for all using (public.is_crm_manager()) with check (public.is_crm_manager());

drop policy if exists "CRM managers manage settings" on public.crm_settings;
create policy "CRM managers manage settings" on public.crm_settings
for all using (public.is_crm_manager()) with check (public.is_crm_manager());

grant select, insert, update, delete on public.crm_contacts to authenticated;
grant select, insert, update, delete on public.crm_conversations to authenticated;
grant select, insert, update, delete on public.crm_messages to authenticated;
grant select, insert, update, delete on public.crm_knowledge_sources to authenticated;
grant select, insert, update on public.crm_settings to authenticated;
grant execute on function public.is_crm_manager() to authenticated;
revoke execute on function public.crm_touch_updated_at() from public, anon, authenticated;

-- Habilita actualizaciones en vivo en el inbox. Evita fallar si la tabla ya fue agregada.
do $$
begin
  alter publication supabase_realtime add table public.crm_contacts;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.crm_conversations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.crm_messages;
exception when duplicate_object then null;
end $$;
