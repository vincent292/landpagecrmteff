-- Orquestacion segura de reservas y pagos iniciados desde WhatsApp.
-- Gemini conversa; estas tablas y funciones conservan la autoridad transaccional.

create table if not exists public.treatment_availability_rules (
  treatment_id uuid not null references public.treatments(id) on delete cascade,
  availability_rule_id uuid not null references public.doctor_availability_rules(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (treatment_id, availability_rule_id)
);

create table if not exists public.crm_booking_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  treatment_id uuid not null references public.treatments(id) on delete restrict,
  user_id uuid references public.profiles(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  status text not null default 'collecting_identity' check (status in (
    'collecting_identity', 'choosing_date', 'choosing_time', 'awaiting_payment',
    'payment_review', 'approved', 'rejected', 'expired', 'cancelled', 'needs_human'
  )),
  identity_step text,
  full_name text,
  document_number text,
  email text,
  phone text,
  city text,
  care_mode text not null default 'presencial' check (care_mode in ('presencial', 'virtual')),
  availability_rule_id uuid references public.doctor_availability_rules(id) on delete set null,
  appointment_date date,
  start_time time,
  end_time time,
  amount_due numeric(12,2),
  hold_expires_at timestamptz,
  payment_receipt_path text,
  payment_submitted_at timestamptz,
  appointment_reservation_id uuid references public.appointment_reservations(id) on delete set null,
  treatment_order_id uuid references public.treatment_orders(id) on delete set null,
  last_options jsonb not null default '[]'::jsonb,
  state_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_booking_one_active_per_conversation_idx
on public.crm_booking_sessions(conversation_id)
where status in ('collecting_identity', 'choosing_date', 'choosing_time', 'awaiting_payment', 'payment_review', 'needs_human');

create index if not exists crm_booking_status_idx
on public.crm_booking_sessions(status, updated_at desc);

create table if not exists public.crm_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  booking_session_id uuid not null references public.crm_booking_sessions(id) on delete cascade,
  crm_message_id uuid references public.crm_messages(id) on delete set null,
  meta_media_id text,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  booking_session_id uuid references public.crm_booking_sessions(id) on delete cascade,
  conversation_id uuid references public.crm_conversations(id) on delete set null,
  recipient_kind text not null check (recipient_kind in ('patient', 'doctor', 'admin')),
  recipient_wa_id text not null,
  body text not null,
  template_name text,
  template_language text not null default 'es',
  template_parameters jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'needs_template')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  meta_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_notification_outbox_pending_idx
on public.crm_notification_outbox(status, next_attempt_at);

alter table public.crm_settings
  add column if not exists patient_confirmation_template text,
  add column if not exists doctor_booking_template text,
  add column if not exists payment_rejected_template text,
  add column if not exists template_language text not null default 'es',
  add column if not exists booking_hold_minutes integer not null default 30
    check (booking_hold_minutes between 10 and 120),
  add column if not exists allow_external_grounding boolean not null default true;

drop trigger if exists crm_booking_touch_updated_at on public.crm_booking_sessions;
create trigger crm_booking_touch_updated_at before update on public.crm_booking_sessions
for each row execute function public.crm_touch_updated_at();

drop trigger if exists crm_outbox_touch_updated_at on public.crm_notification_outbox;
create trigger crm_outbox_touch_updated_at before update on public.crm_notification_outbox
for each row execute function public.crm_touch_updated_at();

alter table public.treatment_availability_rules enable row level security;
alter table public.crm_booking_sessions enable row level security;
alter table public.crm_payment_submissions enable row level security;
alter table public.crm_notification_outbox enable row level security;

create policy "CRM managers manage treatment availability mappings"
on public.treatment_availability_rules for all to authenticated
using (public.is_crm_manager()) with check (public.is_crm_manager());

create policy "CRM managers manage booking sessions"
on public.crm_booking_sessions for all to authenticated
using (public.is_crm_manager()) with check (public.is_crm_manager());

create policy "CRM managers manage payment submissions"
on public.crm_payment_submissions for all to authenticated
using (public.is_crm_manager()) with check (public.is_crm_manager());

create policy "CRM managers view notification outbox"
on public.crm_notification_outbox for select to authenticated
using (public.is_crm_manager());

grant select, insert, update, delete on public.treatment_availability_rules to authenticated;
grant select, insert, update, delete on public.crm_booking_sessions to authenticated;
grant select, insert, update, delete on public.crm_payment_submissions to authenticated;
grant select on public.crm_notification_outbox to authenticated;

create or replace function public.crm_is_server_or_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role() = 'service_role', false) or public.is_crm_manager();
$$;

create or replace function public.crm_expire_booking_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer := 0;
begin
  with expired as (
    update public.crm_booking_sessions
    set status = 'expired', updated_at = now()
    where status = 'awaiting_payment'
      and payment_receipt_path is null
      and hold_expires_at <= now()
    returning appointment_reservation_id, treatment_order_id
  ), cancelled_reservations as (
    update public.appointment_reservations ar
    set status = 'Cancelada',
        admin_notes = coalesce(ar.admin_notes, 'Retencion de WhatsApp vencida sin comprobante.'),
        updated_at = now()
    where ar.id in (select appointment_reservation_id from expired where appointment_reservation_id is not null)
      and ar.status = 'Pendiente'
    returning ar.id
  )
  update public.treatment_orders orders
  set status = 'Cancelado',
      admin_notes = coalesce(orders.admin_notes, 'Retencion de WhatsApp vencida sin comprobante.'),
      updated_at = now()
  where orders.id in (select treatment_order_id from expired where treatment_order_id is not null)
    and orders.status = 'Pendiente';

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

create or replace function public.crm_hold_booking_slot(
  p_session_id uuid,
  p_rule_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time
)
returns public.crm_booking_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.crm_booking_sessions%rowtype;
  treatment_row public.treatments%rowtype;
  rule_row public.doctor_availability_rules%rowtype;
  contact_row public.crm_contacts%rowtype;
  current_start time;
  current_end time;
  slot_matches boolean := false;
  is_blocked boolean := false;
  taken_count integer := 0;
  hold_minutes integer := 30;
  amount_due numeric(12,2);
  reservation_row public.appointment_reservations%rowtype;
  order_row public.treatment_orders%rowtype;
begin
  if not public.crm_is_server_or_manager() then
    raise exception 'No autorizado para crear una retencion de WhatsApp.';
  end if;

  perform public.crm_expire_booking_holds();

  select * into session_row
  from public.crm_booking_sessions
  where id = p_session_id
  for update;

  if session_row.id is null or session_row.status not in ('choosing_date', 'choosing_time') then
    raise exception 'La sesion de reserva ya no permite seleccionar un horario.';
  end if;
  if session_row.user_id is null or session_row.patient_id is null then
    raise exception 'Primero debemos completar y crear la cuenta del paciente.';
  end if;

  select * into treatment_row
  from public.treatments
  where id = session_row.treatment_id and is_active = true and deleted_at is null
  for update;
  if treatment_row.id is null or not coalesce(treatment_row.allows_direct_booking, false) then
    raise exception 'Este tratamiento no permite reserva directa.';
  end if;

  select * into rule_row
  from public.doctor_availability_rules
  where id = p_rule_id and is_active = true and deleted_at is null
  for update;
  if rule_row.id is null then
    raise exception 'La disponibilidad seleccionada ya no esta activa.';
  end if;
  if not exists (
    select 1 from public.treatment_availability_rules mapping
    where mapping.treatment_id = treatment_row.id
      and mapping.availability_rule_id = rule_row.id
      and mapping.is_active = true
  ) then
    raise exception 'El horario no corresponde a este tratamiento.';
  end if;

  perform pg_advisory_xact_lock(hashtext(rule_row.id::text || p_date::text || p_start_time::text || p_end_time::text));

  if not (
    (rule_row.availability_type = 'specific' and rule_row.specific_date = p_date)
    or (
      rule_row.availability_type = 'recurring'
      and rule_row.day_of_week = extract(dow from p_date)::integer
      and (rule_row.start_date is null or rule_row.start_date <= p_date)
      and (rule_row.end_date is null or rule_row.end_date >= p_date)
    )
  ) then
    raise exception 'El horario no pertenece a esta disponibilidad.';
  end if;

  if p_date < (now() at time zone 'America/La_Paz')::date
     or (p_date = (now() at time zone 'America/La_Paz')::date and p_start_time <= (now() at time zone 'America/La_Paz')::time) then
    raise exception 'No se puede reservar un horario pasado.';
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
  if not slot_matches then raise exception 'El horario seleccionado no es valido.'; end if;

  select exists (
    select 1 from public.availability_blocks block
    where block.is_active = true and block.deleted_at is null and block.block_date = p_date
      and (block.doctor_id is null or block.doctor_id = rule_row.doctor_id)
      and (block.city is null or block.city = rule_row.city)
      and ((block.start_time is null and block.end_time is null)
        or (p_start_time < block.end_time and p_end_time > block.start_time))
  ) into is_blocked;
  if is_blocked then raise exception 'Este horario fue bloqueado por administracion.'; end if;

  select count(*)::integer into taken_count
  from public.appointment_reservations reservation
  where reservation.availability_rule_id = rule_row.id
    and reservation.appointment_date = p_date
    and reservation.start_time = p_start_time
    and reservation.end_time = p_end_time
    and coalesce(reservation.is_deleted, false) = false
    and reservation.status in ('Pendiente', 'Confirmada', 'Realizada');
  if taken_count >= rule_row.capacity_per_slot then
    raise exception 'Este horario acaba de quedarse sin cupos.';
  end if;

  select * into contact_row from public.crm_contacts where id = session_row.contact_id;
  amount_due := coalesce(treatment_row.treatment_price, treatment_row.direct_booking_price, treatment_row.assessment_price, 0);
  if amount_due <= 0 then raise exception 'El tratamiento no tiene un precio valido configurado.'; end if;
  select booking_hold_minutes into hold_minutes from public.crm_settings where id = true;
  hold_minutes := greatest(10, least(coalesce(hold_minutes, 30), 120));

  insert into public.appointment_reservations (
    patient_id, user_id, availability_rule_id, doctor_id, title, appointment_type, care_mode,
    city, location, appointment_date, start_time, end_time, status, source, notes,
    payment_amount, payment_expires_at, public_payment_token, public_payment_token_expires_at
  ) values (
    session_row.patient_id, session_row.user_id, rule_row.id, rule_row.doctor_id,
    treatment_row.title, rule_row.appointment_type, session_row.care_mode,
    rule_row.city, rule_row.location, p_date, p_start_time, p_end_time, 'Pendiente', 'whatsapp_crm',
    concat('Reserva iniciada por WhatsApp. Sesion: ', session_row.id), amount_due,
    now() + make_interval(mins => hold_minutes),
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    now() + make_interval(mins => hold_minutes)
  ) returning * into reservation_row;

  insert into public.treatment_orders (
    treatment_id, user_id, full_name, document_number, phone, email, city, notes,
    wants_appointment, payment_mode, payment_percent, total_amount, amount_paid, amount_pending,
    status, preferred_rule_id, preferred_appointment_date, preferred_start_time, preferred_end_time,
    preferred_city, preferred_appointment_type, preferred_agenda_tag, appointment_reservation_id
  ) values (
    treatment_row.id, session_row.user_id, session_row.full_name, session_row.document_number,
    coalesce(session_row.phone, contact_row.phone), session_row.email, coalesce(session_row.city, rule_row.city),
    concat('Pedido iniciado por WhatsApp. Sesion: ', session_row.id), true, 'total', 100,
    amount_due, amount_due, 0, 'Pendiente', rule_row.id, p_date, p_start_time, p_end_time,
    rule_row.city, rule_row.appointment_type, rule_row.agenda_tag, reservation_row.id
  ) returning * into order_row;

  update public.crm_booking_sessions
  set status = 'awaiting_payment', availability_rule_id = rule_row.id,
      appointment_date = p_date, start_time = p_start_time, end_time = p_end_time,
      city = rule_row.city, amount_due = amount_due,
      hold_expires_at = now() + make_interval(mins => hold_minutes),
      appointment_reservation_id = reservation_row.id, treatment_order_id = order_row.id,
      last_options = '[]'::jsonb, updated_at = now()
  where id = session_row.id
  returning * into session_row;

  update public.crm_conversations
  set appointment_reservation_id = reservation_row.id, intent = 'reservar_cita', updated_at = now()
  where id = session_row.conversation_id;
  update public.crm_contacts set lead_stage = 'pago', updated_at = now() where id = session_row.contact_id;

  return session_row;
end;
$$;

create or replace function public.crm_queue_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.crm_booking_sessions%rowtype;
  contact_row public.crm_contacts%rowtype;
  reservation_row public.appointment_reservations%rowtype;
  treatment_title text;
  doctor_name text;
  doctor_whatsapp text;
  patient_body text;
  doctor_body text;
  settings_row public.crm_settings%rowtype;
begin
  if new.status <> 'Aprobado' or old.status = 'Aprobado' then return new; end if;
  select * into session_row from public.crm_booking_sessions where treatment_order_id = new.id limit 1;
  if session_row.id is null then return new; end if;
  select * into contact_row from public.crm_contacts where id = session_row.contact_id;
  select * into reservation_row from public.appointment_reservations where id = session_row.appointment_reservation_id;
  select title into treatment_title from public.treatments where id = session_row.treatment_id;
  select full_name, whatsapp into doctor_name, doctor_whatsapp
  from public.doctor_profiles where id = reservation_row.doctor_id;
  select * into settings_row from public.crm_settings where id = true;

  patient_body := format(
    'Hola %s, tu pago fue aprobado y tu cita para %s quedo confirmada para el %s a las %s en %s%s.',
    coalesce(session_row.full_name, contact_row.full_name, 'paciente'), coalesce(treatment_title, 'tu tratamiento'),
    to_char(reservation_row.appointment_date, 'DD/MM/YYYY'), to_char(reservation_row.start_time, 'HH24:MI'),
    reservation_row.city, case when doctor_name is not null then ' con la Dra. ' || doctor_name else '' end
  );
  insert into public.crm_notification_outbox (
    idempotency_key, booking_session_id, conversation_id, recipient_kind, recipient_wa_id,
    body, template_name, template_language, template_parameters
  ) values (
    'booking-approved-patient:' || session_row.id, session_row.id, session_row.conversation_id,
    'patient', contact_row.wa_id, patient_body, settings_row.patient_confirmation_template,
    settings_row.template_language,
    jsonb_build_array(coalesce(session_row.full_name, contact_row.full_name, 'Paciente'), coalesce(treatment_title, 'Tratamiento'),
      to_char(reservation_row.appointment_date, 'DD/MM/YYYY'), to_char(reservation_row.start_time, 'HH24:MI'), reservation_row.city)
  ) on conflict (idempotency_key) do nothing;

  if nullif(regexp_replace(coalesce(doctor_whatsapp, ''), '[^0-9]', '', 'g'), '') is not null then
    doctor_body := format(
      'Nueva cita confirmada: %s, %s, el %s de %s a %s en %s. Pago verificado.',
      coalesce(session_row.full_name, 'Paciente'), coalesce(treatment_title, 'Tratamiento'),
      to_char(reservation_row.appointment_date, 'DD/MM/YYYY'), to_char(reservation_row.start_time, 'HH24:MI'),
      to_char(reservation_row.end_time, 'HH24:MI'), reservation_row.city
    );
    insert into public.crm_notification_outbox (
      idempotency_key, booking_session_id, recipient_kind, recipient_wa_id,
      body, template_name, template_language, template_parameters
    ) values (
      'booking-approved-doctor:' || session_row.id, session_row.id, 'doctor',
      regexp_replace(doctor_whatsapp, '[^0-9]', '', 'g'), doctor_body,
      settings_row.doctor_booking_template, settings_row.template_language,
      jsonb_build_array(coalesce(session_row.full_name, 'Paciente'), coalesce(treatment_title, 'Tratamiento'),
        to_char(reservation_row.appointment_date, 'DD/MM/YYYY'), to_char(reservation_row.start_time, 'HH24:MI'), reservation_row.city)
    ) on conflict (idempotency_key) do nothing;
  end if;

  update public.crm_booking_sessions set status = 'approved', updated_at = now() where id = session_row.id;
  update public.crm_contacts set lead_stage = 'paciente', updated_at = now() where id = session_row.contact_id;
  return new;
end;
$$;

drop trigger if exists crm_treatment_order_approved_notifications on public.treatment_orders;
create trigger crm_treatment_order_approved_notifications
after update of status on public.treatment_orders
for each row execute function public.crm_queue_booking_notifications();

-- Si la reserva ya fue retenida por WhatsApp, la aprobacion existente debe confirmarla.
create or replace function public.crm_confirm_preheld_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'Aprobado' and old.status <> 'Aprobado' and new.appointment_reservation_id is not null then
    update public.appointment_reservations
    set status = 'Confirmada', payment_verified_at = coalesce(payment_verified_at, now()),
        payment_amount = coalesce(new.amount_paid, payment_amount),
        payment_method = coalesce(new.payment_method, payment_method, 'qr'), updated_at = now()
    where id = new.appointment_reservation_id and status = 'Pendiente';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_confirm_preheld_reservation_trigger on public.treatment_orders;
create trigger crm_confirm_preheld_reservation_trigger
before update of status on public.treatment_orders
for each row execute function public.crm_confirm_preheld_reservation();

grant execute on function public.crm_expire_booking_holds() to service_role, authenticated;
grant execute on function public.crm_hold_booking_slot(uuid, uuid, date, time, time) to service_role, authenticated;
revoke execute on function public.crm_is_server_or_manager() from public, anon;
revoke execute on function public.crm_queue_booking_notifications() from public, anon, authenticated;
revoke execute on function public.crm_confirm_preheld_reservation() from public, anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.crm_booking_sessions;
exception when duplicate_object then null;
end $$;

do $$
declare
  test_treatment_id uuid;
begin
  select id into test_treatment_id from public.treatments where slug = 'prueba-reserva-whatsapp' limit 1;
  if test_treatment_id is null then
    insert into public.treatments (
      title, slug, short_description, description, public_info, benefits, duration,
      care_instructions, expected_results, is_featured, is_active, doctor_id, city,
      agenda_mode, appointment_type, treatment_price, available_slots, approved_slots,
      allows_direct_booking, allows_partial_payment, partial_payment_percent
    )
    select
      'PRUEBA INTERNA · RESERVA WHATSAPP', 'prueba-reserva-whatsapp',
      'Tratamiento interno para validar el flujo completo de WhatsApp.',
      'Registro temporal para probar disponibilidad, QR, comprobante, aprobacion y notificaciones.',
      'Solo para pruebas internas. No representa una recomendacion medica ni un tratamiento comercial.',
      'Validacion integral del proceso.', '30 minutos',
      'No aplica: prueba interna.', 'No aplica: prueba interna.', false, true,
      rule.doctor_id, rule.city, 'choose_slot', rule.appointment_type, 1, 100, 0, true, false, 100
    from public.doctor_availability_rules rule
    where rule.is_active = true and rule.deleted_at is null and rule.doctor_id is not null
    order by rule.created_at
    limit 1
    returning id into test_treatment_id;
  end if;

  if test_treatment_id is not null then
    insert into public.treatment_availability_rules (treatment_id, availability_rule_id)
    select test_treatment_id, rule.id
    from public.doctor_availability_rules rule
    join public.treatments treatment on treatment.id = test_treatment_id
    where rule.is_active = true and rule.deleted_at is null
      and rule.doctor_id = treatment.doctor_id and rule.city = treatment.city
    on conflict (treatment_id, availability_rule_id) do update set is_active = true;
  end if;

  -- Deja preparada la relacion explicita de los tratamientos reales. La reserva
  -- directa solo se habilita cuando administracion configure un precio valido.
  insert into public.treatment_availability_rules (treatment_id, availability_rule_id)
  select treatment.id, rule.id
  from public.treatments treatment
  join public.doctor_availability_rules rule
    on rule.doctor_id = treatment.doctor_id
   and rule.city = treatment.city
   and rule.appointment_type = treatment.appointment_type
  where treatment.is_active = true and treatment.deleted_at is null
    and rule.is_active = true and rule.deleted_at is null
  on conflict (treatment_id, availability_rule_id) do nothing;
end $$;

notify pgrst, 'reload schema';
