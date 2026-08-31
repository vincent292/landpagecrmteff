-- Avisos automáticos de comprobantes, agenda descargable y reprogramación solicitada por la doctora.
-- La aprobación sigue ocurriendo únicamente dentro del CRM autenticado.

alter table public.crm_settings
  add column if not exists site_url text not null default 'https://www.draballesteros.com',
  add column if not exists admin_notification_whatsapps text[] not null default '{}'::text[],
  add column if not exists admin_receipt_review_template text,
  add column if not exists patient_reschedule_template text,
  add column if not exists admin_doctor_unavailable_template text;

alter table public.appointment_reservations
  add column if not exists appointment_code text,
  add column if not exists calendar_uid text,
  add column if not exists doctor_response_token text,
  add column if not exists doctor_response_status text not null default 'pending',
  add column if not exists doctor_response_at timestamptz,
  add column if not exists doctor_response_notes text,
  add column if not exists reschedule_requested_at timestamptz,
  add column if not exists reschedule_reason text;

update public.appointment_reservations
set appointment_code = coalesce(appointment_code, 'CITA-' || upper(replace(substring(id::text from 1 for 8), '-', ''))),
    calendar_uid = coalesce(calendar_uid, replace(id::text, '-', '') || '@draestefany.app'),
    doctor_response_token = coalesce(doctor_response_token, encode(gen_random_bytes(24), 'hex'))
where appointment_code is null or calendar_uid is null or doctor_response_token is null;

alter table public.appointment_reservations
  alter column appointment_code set default ('CITA-' || upper(replace(substring(gen_random_uuid()::text from 1 for 8), '-', ''))),
  alter column calendar_uid set default (replace(gen_random_uuid()::text, '-', '') || '@draestefany.app'),
  alter column doctor_response_token set default encode(gen_random_bytes(24), 'hex');

alter table public.appointment_reservations
  alter column appointment_code set not null,
  alter column calendar_uid set not null,
  alter column doctor_response_token set not null;

create unique index if not exists appointment_reservations_appointment_code_idx on public.appointment_reservations(appointment_code);
create unique index if not exists appointment_reservations_calendar_uid_idx on public.appointment_reservations(calendar_uid);
create unique index if not exists appointment_reservations_doctor_response_token_idx on public.appointment_reservations(doctor_response_token);

alter table public.appointment_reservations drop constraint if exists appointment_reservations_status_check;
alter table public.appointment_reservations
  add constraint appointment_reservations_status_check check (status in ('Pendiente', 'Confirmada', 'Realizada', 'Cancelada', 'Rechazada', 'Reprogramacion'));

alter table public.appointment_reservations drop constraint if exists appointment_reservations_doctor_response_status_check;
alter table public.appointment_reservations
  add constraint appointment_reservations_doctor_response_status_check check (doctor_response_status in ('pending', 'acknowledged', 'unavailable'));

create or replace function public.crm_queue_payment_review_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.crm_booking_sessions%rowtype;
  reservation_row public.appointment_reservations%rowtype;
  treatment_title text;
  settings_row public.crm_settings%rowtype;
  recipient text;
  review_url text;
begin
  if new.status <> 'payment_review' or old.status = 'payment_review' then return new; end if;
  select * into reservation_row from public.appointment_reservations where id = new.appointment_reservation_id;
  select title into treatment_title from public.treatments where id = new.treatment_id;
  select * into settings_row from public.crm_settings where id = true;
  review_url := trim(trailing '/' from settings_row.site_url) || '/panel/pagos-reservas?reservation=' || coalesce(reservation_row.id::text, '');

  foreach recipient in array settings_row.admin_notification_whatsapps loop
    recipient := nullif(regexp_replace(coalesce(recipient, ''), '[^0-9]', '', 'g'), '');
    if recipient is not null then
      insert into public.crm_notification_outbox (
        idempotency_key, booking_session_id, conversation_id, recipient_kind, recipient_wa_id,
        body, template_name, template_language, template_parameters
      ) values (
        'booking-receipt-admin:' || new.id || ':' || recipient, new.id, new.conversation_id, 'admin', recipient,
        format('Comprobante recibido para revisar. %s · %s · %s %s · %s Bs. Abrir y aprobar en CRM: %s',
          coalesce(reservation_row.appointment_code, 'Cita'), coalesce(treatment_title, 'Tratamiento'),
          to_char(reservation_row.appointment_date, 'DD/MM/YYYY'), to_char(reservation_row.start_time, 'HH24:MI'),
          coalesce(new.amount_due, reservation_row.payment_amount, 0), review_url),
        settings_row.admin_receipt_review_template, settings_row.template_language,
        jsonb_build_array(coalesce(reservation_row.appointment_code, 'Cita'), coalesce(treatment_title, 'Tratamiento'),
          to_char(reservation_row.appointment_date, 'DD/MM/YYYY'), to_char(reservation_row.start_time, 'HH24:MI'), review_url)
      ) on conflict (idempotency_key) do nothing;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists crm_booking_payment_review_alert on public.crm_booking_sessions;
create trigger crm_booking_payment_review_alert
after update of status on public.crm_booking_sessions
for each row execute function public.crm_queue_payment_review_alert();

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
  calendar_url text;
  unavailable_url text;
begin
  if new.status <> 'Aprobado' or old.status = 'Aprobado' then return new; end if;
  select * into session_row from public.crm_booking_sessions where treatment_order_id = new.id limit 1;
  if session_row.id is null then return new; end if;
  select * into contact_row from public.crm_contacts where id = session_row.contact_id;
  select * into reservation_row from public.appointment_reservations where id = session_row.appointment_reservation_id;
  select title into treatment_title from public.treatments where id = session_row.treatment_id;
  select full_name, whatsapp into doctor_name, doctor_whatsapp from public.doctor_profiles where id = reservation_row.doctor_id;
  select * into settings_row from public.crm_settings where id = true;
  calendar_url := 'https://huwdvusjdiumohegffci.supabase.co/functions/v1/appointment-calendar?token=' || reservation_row.doctor_response_token;
  unavailable_url := 'https://huwdvusjdiumohegffci.supabase.co/functions/v1/doctor-appointment-response?token=' || reservation_row.doctor_response_token;

  patient_body := format('Hola %s, tu pago fue aprobado y tu cita %s para %s quedo confirmada para el %s a las %s en %s%s.',
    coalesce(session_row.full_name, contact_row.full_name, 'paciente'), reservation_row.appointment_code,
    coalesce(treatment_title, 'tu tratamiento'), to_char(reservation_row.appointment_date, 'DD/MM/YYYY'),
    to_char(reservation_row.start_time, 'HH24:MI'), reservation_row.city,
    case when doctor_name is not null then ' con la Dra. ' || doctor_name else '' end);
  insert into public.crm_notification_outbox (
    idempotency_key, booking_session_id, conversation_id, recipient_kind, recipient_wa_id, body, template_name, template_language, template_parameters
  ) values (
    'booking-approved-patient:' || session_row.id, session_row.id, session_row.conversation_id, 'patient', contact_row.wa_id,
    patient_body, settings_row.patient_confirmation_template, settings_row.template_language,
    jsonb_build_array(coalesce(session_row.full_name, contact_row.full_name, 'Paciente'), coalesce(treatment_title, 'Tratamiento'),
      to_char(reservation_row.appointment_date, 'DD/MM/YYYY'), to_char(reservation_row.start_time, 'HH24:MI'), reservation_row.city)
  ) on conflict (idempotency_key) do nothing;

  if nullif(regexp_replace(coalesce(doctor_whatsapp, ''), '[^0-9]', '', 'g'), '') is not null then
    doctor_body := format('Nueva cita confirmada %s: %s · %s · %s, de %s a %s en %s. Pago verificado. Calendario (Apple/Google): %s Si no puedes atenderla, solicita reprogramación aquí: %s',
      reservation_row.appointment_code, coalesce(session_row.full_name, 'Paciente'), coalesce(treatment_title, 'Tratamiento'),
      to_char(reservation_row.appointment_date, 'DD/MM/YYYY'), to_char(reservation_row.start_time, 'HH24:MI'),
      to_char(reservation_row.end_time, 'HH24:MI'), reservation_row.city, calendar_url, unavailable_url);
    insert into public.crm_notification_outbox (
      idempotency_key, booking_session_id, recipient_kind, recipient_wa_id, body, template_name, template_language, template_parameters
    ) values (
      'booking-approved-doctor:' || session_row.id, session_row.id, 'doctor', regexp_replace(doctor_whatsapp, '[^0-9]', '', 'g'),
      doctor_body, settings_row.doctor_booking_template, settings_row.template_language,
      jsonb_build_array(reservation_row.appointment_code, coalesce(session_row.full_name, 'Paciente'), coalesce(treatment_title, 'Tratamiento'),
        to_char(reservation_row.appointment_date, 'DD/MM/YYYY'), to_char(reservation_row.start_time, 'HH24:MI'), calendar_url, unavailable_url)
    ) on conflict (idempotency_key) do nothing;
  end if;
  update public.crm_booking_sessions set status = 'approved', updated_at = now() where id = session_row.id;
  update public.crm_contacts set lead_stage = 'paciente', updated_at = now() where id = session_row.contact_id;
  return new;
end;
$$;

-- Procesa la cola incluso sin una pantalla de administración abierta. La clave está en Vault y no en el repositorio.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'dispatch-whatsapp-crm-notifications';
select cron.schedule(
  'dispatch-whatsapp-crm-notifications',
  '* * * * *',
  $$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'crm_dispatch_function_url'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-crm-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_dispatch_secret')),
      body := jsonb_build_object('source', 'cron'), timeout_milliseconds := 10000
    );$$
);

revoke execute on function public.crm_queue_payment_review_alert() from public, anon, authenticated;
revoke execute on function public.crm_queue_booking_notifications() from public, anon, authenticated;
