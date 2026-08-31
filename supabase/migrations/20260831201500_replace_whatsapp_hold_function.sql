-- Reemplaza la función con una variable de importe sin colisión de nombres.
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
  booking_amount_due numeric(12,2);
  reservation_row public.appointment_reservations%rowtype;
  order_row public.treatment_orders%rowtype;
begin
  if not public.crm_is_server_or_manager() then
    raise exception 'No autorizado para crear una retencion de WhatsApp.';
  end if;

  perform public.crm_expire_booking_holds();

  select * into session_row from public.crm_booking_sessions where id = p_session_id for update;
  if session_row.id is null or session_row.status not in ('choosing_date', 'choosing_time') then
    raise exception 'La sesion de reserva ya no permite seleccionar un horario.';
  end if;
  if session_row.user_id is null or session_row.patient_id is null then
    raise exception 'Primero debemos completar y crear la cuenta del paciente.';
  end if;

  select * into treatment_row from public.treatments
  where id = session_row.treatment_id and is_active = true and deleted_at is null for update;
  if treatment_row.id is null or not coalesce(treatment_row.allows_direct_booking, false) then
    raise exception 'Este tratamiento no permite reserva directa.';
  end if;

  select * into rule_row from public.doctor_availability_rules
  where id = p_rule_id and is_active = true and deleted_at is null for update;
  if rule_row.id is null then raise exception 'La disponibilidad seleccionada ya no esta activa.'; end if;
  if not exists (
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

  select count(*)::integer into taken_count from public.appointment_reservations reservation
  where reservation.availability_rule_id = rule_row.id and reservation.appointment_date = p_date
    and reservation.start_time = p_start_time and reservation.end_time = p_end_time
    and coalesce(reservation.is_deleted, false) = false
    and reservation.status in ('Pendiente', 'Confirmada', 'Realizada');
  if taken_count >= rule_row.capacity_per_slot then raise exception 'Este horario acaba de quedarse sin cupos.'; end if;

  select * into contact_row from public.crm_contacts where id = session_row.contact_id;
  booking_amount_due := coalesce(treatment_row.treatment_price, treatment_row.direct_booking_price, treatment_row.assessment_price, 0);
  if booking_amount_due <= 0 then raise exception 'El tratamiento no tiene un precio valido configurado.'; end if;
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
    concat('Reserva iniciada por WhatsApp. Sesion: ', session_row.id), booking_amount_due,
    now() + make_interval(mins => hold_minutes), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
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
    booking_amount_due, booking_amount_due, 0, 'Pendiente', rule_row.id, p_date, p_start_time, p_end_time,
    rule_row.city, rule_row.appointment_type, rule_row.agenda_tag, reservation_row.id
  ) returning * into order_row;

  update public.crm_booking_sessions
  set status = 'awaiting_payment', availability_rule_id = rule_row.id,
      appointment_date = p_date, start_time = p_start_time, end_time = p_end_time,
      city = rule_row.city, amount_due = booking_amount_due,
      hold_expires_at = now() + make_interval(mins => hold_minutes),
      appointment_reservation_id = reservation_row.id, treatment_order_id = order_row.id,
      last_options = '[]'::jsonb, updated_at = now()
  where id = session_row.id returning * into session_row;

  update public.crm_conversations set appointment_reservation_id = reservation_row.id, intent = 'reservar_cita', updated_at = now()
  where id = session_row.conversation_id;
  update public.crm_contacts set lead_stage = 'pago', updated_at = now() where id = session_row.contact_id;
  return session_row;
end;
$$;
