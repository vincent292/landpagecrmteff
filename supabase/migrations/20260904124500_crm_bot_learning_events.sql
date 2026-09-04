create table if not exists public.crm_bot_learning_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.crm_conversations(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  booking_session_id uuid references public.crm_booking_sessions(id) on delete set null,
  crm_message_id uuid references public.crm_messages(id) on delete set null,
  event_type text not null check (event_type in (
    'booking_step_recovery',
    'booking_handoff',
    'booking_info_interruption',
    'doctor_clarification',
    'doctor_catalog_missing',
    'ai_fallback',
    'human_reply_example'
  )),
  detected_intent text,
  user_text text,
  bot_response text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'ignored', 'applied')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now()
);

create index if not exists crm_bot_learning_events_created_idx
on public.crm_bot_learning_events(created_at desc);

create index if not exists crm_bot_learning_events_status_idx
on public.crm_bot_learning_events(status, created_at desc);

alter table public.crm_bot_learning_events enable row level security;

drop policy if exists "CRM managers manage bot learning events" on public.crm_bot_learning_events;
create policy "CRM managers manage bot learning events"
on public.crm_bot_learning_events for all to authenticated
using (public.is_crm_manager()) with check (public.is_crm_manager());

grant select, insert, update, delete on public.crm_bot_learning_events to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.crm_bot_learning_events;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
