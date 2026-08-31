-- Las valoraciones iniciadas por WhatsApp usan la misma agenda del
-- tratamiento, pero no consumen los cupos de venta directa del tratamiento.
create or replace function public.crm_enforce_treatment_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quota integer := 0;
  occupied integer := 0;
  was_occupying boolean := false;
  is_occupying boolean := false;
  new_is_assessment boolean := false;
begin
  new_is_assessment := coalesce(new.state_data ->> 'booking_kind', '') = 'assessment';
  is_occupying := new.status in ('awaiting_payment', 'payment_review', 'approved') and not new_is_assessment;
  was_occupying := tg_op = 'UPDATE'
    and old.status in ('awaiting_payment', 'payment_review', 'approved')
    and coalesce(old.state_data ->> 'booking_kind', '') <> 'assessment';
  if not is_occupying or was_occupying then return new; end if;

  select coalesce(available_slots, 0)::integer into quota
  from public.treatments where id = new.treatment_id for update;
  if quota <= 0 then return new; end if;

  perform pg_advisory_xact_lock(hashtext('crm-treatment-quota:' || new.treatment_id::text));
  select count(*)::integer into occupied
  from public.crm_booking_sessions
  where treatment_id = new.treatment_id
    and id <> new.id
    and status in ('awaiting_payment', 'payment_review', 'approved')
    and coalesce(state_data ->> 'booking_kind', '') <> 'assessment';

  if occupied >= quota then
    raise exception 'Este tratamiento ya alcanzó sus % cupos disponibles.', quota;
  end if;
  return new;
end;
$$;

-- Esta función conserva la transacción atómica de cupo, reserva y pago,
-- añadiendo el camino de valoración configurado en cada tratamiento.
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
  settings_row public.site_settings%rowtype;
  current_start time;
  current_end time;
  slot_matches boolean := false;
  is_blocked boolean := false;
  taken_count integer := 0;
  hold_minutes integer := 30;
  booking_amount_due numeric(12,2);
  is_assessment_booking boolean := false;
  booking_title text;
  booking_source text;
  booking_notes text;
  reservation_row public.appointment_reservations%rowtype;
  order_row public.treatment_orders%rowtype;
begin
  if not public.crm_is_server_or_manager() then
    raise exception 'No autorizado para crear una retención de WhatsApp.';
  end if;

  perform public.crm_expire_booking_holds();

  select * into session_row from public.crm_booking_sessions where id = p_session_id for update;
  if session_row.id is null or session_row.status not in ('choosing_date', 'choosing_time') then
    raise exception 'La sesión de reserva ya no permite seleccionar un horario.';
  end if;
  if session_row.user_id is null or session_row.patient_id is null then
    raise exception 'Primero debemos completar y crear la cuenta del paciente.';
  end if;

  select * into treatment_row from public.treatments
  where id = session_row.treatment_id and is_active = true and deleted_at is null for update;
  if treatment_row.id is null then raise exception 'El tratamiento ya no está disponible.'; end if;

  is_assessment_booking := coalesce(session_row.state_data ->> 'booking_kind', '') = 'assessment';
  if is_assessment_booking and not coalesce(treatment_row.requires_assessment, false) then
    raise exception 'Este tratamiento ya no requiere valoración previa.';
  end if;
  if not is_assessment_booking and not coalesce(treatment_row.allows_direct_booking, false) then
    raise exception 'Este tratamiento no permite reserva directa.';
  end if;

  select * into rule_row from public.doctor_availability_rules
  where id = p_rule_id and is_active = true and deleted_at is null for update;
  if rule_row.id is null then raise exception 'La disponibilidad seleccionada ya no está activa.'; end if;
  if not is_assessment_booking and not exists (
    select 1 from public.treatment_availability_rules mapping
    where mapping.treatment_id = treatment_row.id
      and mapping.availability_rule_id = rule_row.id and mapping.is_active = true
  ) then raise exception 'El horario no corresponde a este tratamiento.'; end if;

  perform pg_advisory_xact_lock(hashtext(rule_row.id::text || p_date::text || p_start_time::text || p_end_time::text));
  if not (
    (rule_row.availability_type = 'specific' and rule_row.specific_date = p_date)
    or (rule_row.availability_type = 'recurring' and rule_row.day_of_week = extract(dow from p_date)::integer
      and (rule_row.start_date is null or rule_row.start_date <= p_date)
      and (rule_row.end_date is null or rule_row.end_date >= p_date))
  ) then raise exception 'El horario no pertenece a esta disponibilidad.'; end if;
  if p_date < (now() at time zone 'America/La_Paz')::date
    or (p_date = (now() at time zone 'America/La_Paz')::date and p_start_time <= (now() at time zone 'America/La_Paz')::time)
  then raise exception 'No se puede reservar un horario pasado.'; end if;

  current_start := rule_row.start_time;
  loop
    current_end := ('2000-01-01'::date + current_start + make_interval(mins => rule_row.slot_duration_minutes))::time;
    exit when current_end > rule_row.end_time or current_end <= current_start;
    if current_start = p_start_time and current_end = p_end_time then slot_matches := true; exit; end if;
    current_start := ('2000-01-01'::date + current_start + make_interval(mins => rule_row.slot_duration_minutes + rule_row.break_minutes))::time;
  end loop;
  if not slot_matches then raise exception 'El horario seleccionado no es válido.'; end if;

  select exists (
    select 1 from public.availability_blocks block
    where block.is_active = true and block.deleted_at is null and block.block_date = p_date
      and (block.doctor_id is null or block.doctor_id = rule_row.doctor_id)
      and (block.city is null or block.city = rule_row.city)
      and ((block.start_time is null and block.end_time is null)
        or (p_start_time < block.end_time and p_end_time > block.start_time))
  ) into is_blocked;
  if is_blocked then raise exception 'Este horario fue bloqueado por administración.'; end if;

  select count(*)::integer into taken_count from public.appointment_reservations reservation
  where reservation.availability_rule_id = rule_row.id and reservation.appointment_date = p_date
    and reservation.start_time = p_start_time and reservation.end_time = p_end_time
    and coalesce(reservation.is_deleted, false) = false
    and reservation.status in ('Pendiente', 'Confirmada', 'Realizada');
  if taken_count >= rule_row.capacity_per_slot then raise exception 'Este horario acaba de quedarse sin cupos.'; end if;

  select * into contact_row from public.crm_contacts where id = session_row.contact_id;
  select * into settings_row from public.site_settings where id = true limit 1;
  if is_assessment_booking then
    booking_amount_due := case session_row.care_mode
      when 'virtual' then coalesce(treatment_row.assessment_price_virtual, treatment_row.assessment_price, settings_row.assessment_price, 0)
      else coalesce(treatment_row.assessment_price_presencial, treatment_row.assessment_price, settings_row.assessment_price, 0)
    end;
    booking_title := concat(coalesce(nullif(trim(settings_row.assessment_label), ''), 'Valoración'), ': ', treatment_row.title);
    booking_source := 'whatsapp_assessment';
    booking_notes := concat('Valoración solicitada por WhatsApp para ', treatment_row.title, '. Sesión: ', session_row.id);
  else
    booking_amount_due := coalesce(treatment_row.treatment_price, treatment_row.direct_booking_price, treatment_row.assessment_price, 0);
    booking_title := treatment_row.title;
    booking_source := 'whatsapp_crm';
    booking_notes := concat('Reserva iniciada por WhatsApp. Sesión: ', session_row.id);
  end if;
  if not is_assessment_booking and booking_amount_due <= 0 then
    raise exception 'El tratamiento no tiene un precio válido configurado.';
  end if;
  select booking_hold_minutes into hold_minutes from public.crm_settings where id = true;
  hold_minutes := greatest(10, least(coalesce(hold_minutes, 30), 120));

  insert into public.appointment_reservations (
    patient_id, user_id, availability_rule_id, doctor_id, title, appointment_type, care_mode,
    city, location, appointment_date, start_time, end_time, status, source, notes,
    payment_amount, payment_expires_at, public_payment_token, public_payment_token_expires_at
  ) values (
    session_row.patient_id, session_row.user_id, rule_row.id, rule_row.doctor_id,
    booking_title, rule_row.appointment_type, session_row.care_mode,
    rule_row.city, rule_row.location, p_date, p_start_time, p_end_time, 'Pendiente', booking_source, booking_notes,
    case when booking_amount_due > 0 then booking_amount_due else null end,
    case when booking_amount_due > 0 then now() + make_interval(mins => hold_minutes) else null end,
    case when booking_amount_due > 0 then upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)) else null end,
    case when booking_amount_due > 0 then now() + make_interval(mins => hold_minutes) else null end
  ) returning * into reservation_row;

  insert into public.treatment_orders (
    treatment_id, user_id, full_name, document_number, phone, email, city, notes,
    wants_appointment, payment_mode, payment_percent, total_amount, amount_paid, amount_pending,
    status, preferred_rule_id, preferred_appointment_date, preferred_start_time, preferred_end_time,
    preferred_city, preferred_appointment_type, preferred_agenda_tag, appointment_reservation_id
  ) values (
    treatment_row.id, session_row.user_id, session_row.full_name, session_row.document_number,
    coalesce(session_row.phone, contact_row.phone), session_row.email, coalesce(session_row.city, rule_row.city),
    booking_notes, true, 'total', 100, booking_amount_due, booking_amount_due, 0,
    case when booking_amount_due > 0 then 'Pendiente' else 'En revision' end,
    rule_row.id, p_date, p_start_time, p_end_time, rule_row.city, rule_row.appointment_type,
    rule_row.agenda_tag, reservation_row.id
  ) returning * into order_row;

  update public.crm_booking_sessions
  set status = case when booking_amount_due > 0 then 'awaiting_payment' else 'needs_human' end,
      availability_rule_id = rule_row.id, appointment_date = p_date, start_time = p_start_time, end_time = p_end_time,
      city = rule_row.city, amount_due = booking_amount_due,
      hold_expires_at = case when booking_amount_due > 0 then now() + make_interval(mins => hold_minutes) else null end,
      appointment_reservation_id = reservation_row.id, treatment_order_id = order_row.id,
      last_options = '[]'::jsonb,
      state_data = session_row.state_data || jsonb_build_object('booking_kind', case when is_assessment_booking then 'assessment' else 'treatment' end),
      updated_at = now()
  where id = session_row.id returning * into session_row;

  update public.crm_conversations
  set appointment_reservation_id = reservation_row.id,
      intent = case when is_assessment_booking then 'solicitar_valoracion' else 'reservar_cita' end,
      needs_human = booking_amount_due <= 0,
      updated_at = now()
  where id = session_row.conversation_id;
  update public.crm_contacts set lead_stage = case when booking_amount_due > 0 then 'pago' else 'cita' end, updated_at = now()
  where id = session_row.contact_id;
  return session_row;
end;
$$;

revoke execute on function public.crm_enforce_treatment_quota() from public, anon, authenticated;
revoke execute on function public.crm_hold_booking_slot(uuid, uuid, date, time, time) from public, anon, authenticated;
grant execute on function public.crm_hold_booking_slot(uuid, uuid, date, time, time) to service_role;

notify pgrst, 'reload schema';
