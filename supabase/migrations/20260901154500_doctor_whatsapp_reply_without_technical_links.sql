-- Keep doctor WhatsApp notifications human-readable: no raw Supabase links in the visible message.
create or replace function public.crm_queue_confirmed_whatsapp_reservation_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.crm_booking_sessions%rowtype;
  contact_row public.crm_contacts%rowtype;
  treatment_title text;
  doctor_name text;
  doctor_whatsapp text;
  settings_row public.crm_settings%rowtype;
  patient_body text;
  doctor_body text;
  calendar_url text;
  patient_wa_id text;
  doctor_wa_id text;
begin
  if new.status <> 'Confirmada' or old.status = 'Confirmada' then
    return new;
  end if;

  select * into session_row
  from public.crm_booking_sessions
  where appointment_reservation_id = new.id
  order by created_at desc
  limit 1;
  if session_row.id is null then
    return new;
  end if;

  select * into contact_row from public.crm_contacts where id = session_row.contact_id;
  select title into treatment_title from public.treatments where id = session_row.treatment_id;
  select full_name, whatsapp into doctor_name, doctor_whatsapp
  from public.doctor_profiles where id = new.doctor_id;
  select * into settings_row from public.crm_settings where id = true;

  patient_wa_id := nullif(regexp_replace(coalesce(contact_row.wa_id, ''), '[^0-9]', '', 'g'), '');
  doctor_wa_id := nullif(regexp_replace(coalesce(doctor_whatsapp, ''), '[^0-9]', '', 'g'), '');
  if doctor_wa_id ~ '^[0-9]{8}$' then
    doctor_wa_id := '591' || doctor_wa_id;
  end if;

  calendar_url := 'https://huwdvusjdiumohegffci.supabase.co/functions/v1/appointment-calendar?token=' || new.doctor_response_token;

  patient_body := format(
    'Hola %s, tu pago fue aprobado y tu cita %s para %s quedo confirmada para el %s a las %s en %s%s.',
    coalesce(session_row.full_name, contact_row.full_name, 'paciente'), new.appointment_code,
    coalesce(treatment_title, new.title, 'tu tratamiento'), to_char(new.appointment_date, 'DD/MM/YYYY'),
    to_char(new.start_time, 'HH24:MI'), coalesce(new.city, 'la sede seleccionada'),
    case when doctor_name is not null then ' con la Dra. ' || doctor_name else '' end
  );
  if patient_wa_id is not null then
    insert into public.crm_notification_outbox (
      idempotency_key, booking_session_id, conversation_id, recipient_kind, recipient_wa_id,
      body, template_name, template_language, template_parameters
    ) values (
      'booking-approved-patient:' || session_row.id, session_row.id, session_row.conversation_id,
      'patient', patient_wa_id, patient_body, settings_row.patient_confirmation_template,
      settings_row.template_language,
      jsonb_build_array(coalesce(session_row.full_name, contact_row.full_name, 'Paciente'), coalesce(treatment_title, new.title, 'Tratamiento'),
        to_char(new.appointment_date, 'DD/MM/YYYY'), to_char(new.start_time, 'HH24:MI'), coalesce(new.city, ''))
    ) on conflict (idempotency_key) do nothing;
  end if;

  if doctor_wa_id is not null then
    doctor_body := format(
      'Nueva cita confirmada %s: %s - %s - %s, de %s a %s en %s. Pago verificado. Te adjunto el calendario Apple/Google. Si no puedes atenderla, responde por este chat: REPROGRAMAR %s',
      new.appointment_code, coalesce(session_row.full_name, contact_row.full_name, 'Paciente'),
      coalesce(treatment_title, new.title, 'Tratamiento'), to_char(new.appointment_date, 'DD/MM/YYYY'),
      to_char(new.start_time, 'HH24:MI'), to_char(new.end_time, 'HH24:MI'), coalesce(new.city, 'la sede seleccionada'),
      new.appointment_code
    );
    insert into public.crm_notification_outbox (
      idempotency_key, booking_session_id, recipient_kind, recipient_wa_id,
      body, template_name, template_language, template_parameters,
      attachment_url, attachment_filename, attachment_template_header
    ) values (
      'booking-approved-doctor:' || session_row.id, session_row.id, 'doctor', doctor_wa_id,
      doctor_body, settings_row.doctor_booking_template, settings_row.template_language,
      jsonb_build_array(
        new.appointment_code,
        coalesce(session_row.full_name, contact_row.full_name, 'Paciente'),
        concat(to_char(new.appointment_date, 'DD/MM/YYYY'), ' de ', to_char(new.start_time, 'HH24:MI'), ' a ', to_char(new.end_time, 'HH24:MI'), ' en ', coalesce(new.city, 'la sede seleccionada')),
        'REPROGRAMAR ' || new.appointment_code
      ),
      calendar_url, coalesce(new.appointment_code, 'cita') || '.ics', settings_row.doctor_booking_template_document_header
    ) on conflict (idempotency_key) do nothing;
  end if;

  update public.crm_payment_submissions
  set status = 'approved', reviewed_by = coalesce(reviewed_by, auth.uid()), reviewed_at = coalesce(reviewed_at, now())
  where booking_session_id = session_row.id and status = 'pending';
  update public.crm_booking_sessions set status = 'approved', updated_at = now() where id = session_row.id;
  update public.crm_conversations set needs_human = false, intent = 'cita_confirmada', updated_at = now() where id = session_row.conversation_id;
  update public.crm_contacts set lead_stage = 'paciente', updated_at = now() where id = session_row.contact_id;
  return new;
end;
$$;

update public.crm_settings
set doctor_booking_template = null,
    doctor_booking_template_document_header = false
where doctor_booking_template = 'cita_confirmada_doctora';

notify pgrst, 'reload schema';
