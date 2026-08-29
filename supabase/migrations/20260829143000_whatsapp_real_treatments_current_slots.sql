-- Datos operativos para probar reservas reales desde WhatsApp CRM.
-- La IA conversa primero; la reserva directa inicia solo cuando el paciente pide agendar.

update public.crm_settings
set
  ai_enabled = true,
  allow_external_grounding = true,
  booking_hold_minutes = 21,
  updated_at = now()
where id = true;

do $$
declare
  base_rule public.doctor_availability_rules%rowtype;
  base_date date := (now() at time zone 'America/La_Paz')::date;
begin
  select *
  into base_rule
  from public.doctor_availability_rules
  where is_active = true
    and deleted_at is null
    and doctor_id is not null
    and city = 'Cochabamba'
    and appointment_type = 'Procedimiento'
  order by
    case when availability_type = 'recurring' then 0 else 1 end,
    created_at
  limit 1;

  if base_rule.id is null then
    raise notice 'No hay regla base de Procedimiento para preparar pruebas de WhatsApp.';
    return;
  end if;

  update public.doctor_availability_rules
  set capacity_per_slot = 2,
      updated_at = now()
  where is_active = true
    and deleted_at is null
    and doctor_id = base_rule.doctor_id
    and city = base_rule.city
    and appointment_type = base_rule.appointment_type;

  insert into public.doctor_availability_rules (
    doctor_id,
    city,
    location,
    appointment_type,
    care_mode,
    agenda_tag,
    availability_type,
    specific_date,
    start_time,
    end_time,
    slot_duration_minutes,
    break_minutes,
    capacity_per_slot,
    is_active
  )
  select
    base_rule.doctor_id,
    base_rule.city,
    base_rule.location,
    base_rule.appointment_type,
    coalesce(base_rule.care_mode, 'presencial'),
    base_rule.agenda_tag,
    'specific',
    base_date + offset_days,
    time '14:00',
    time '18:00',
    60,
    0,
    2,
    true
  from generate_series(1, 7) as offset_days
  where not exists (
    select 1
    from public.doctor_availability_rules existing
    where existing.is_active = true
      and existing.deleted_at is null
      and existing.doctor_id = base_rule.doctor_id
      and existing.city = base_rule.city
      and existing.appointment_type = base_rule.appointment_type
      and existing.availability_type = 'specific'
      and existing.specific_date = base_date + offset_days
      and existing.start_time = time '14:00'
      and existing.end_time = time '18:00'
  );

  update public.treatments
  set
    doctor_id = coalesce(doctor_id, base_rule.doctor_id),
    city = coalesce(nullif(city, ''), base_rule.city),
    appointment_type = coalesce(nullif(appointment_type, ''), base_rule.appointment_type),
    agenda_tag = coalesce(agenda_tag, base_rule.agenda_tag),
    agenda_mode = 'choose_slot',
    allows_direct_booking = true,
    treatment_price = coalesce(treatment_price, direct_booking_price, assessment_price, 1),
    direct_booking_price = coalesce(direct_booking_price, treatment_price, assessment_price, 1),
    available_slots = 2,
    approved_slots = least(coalesce(approved_slots, 0), 2),
    is_active = true
  where deleted_at is null
    and title is not null;

  insert into public.treatment_availability_rules (treatment_id, availability_rule_id, is_active)
  select treatment.id, rule.id, true
  from public.treatments treatment
  join public.doctor_availability_rules rule
    on rule.doctor_id = treatment.doctor_id
   and rule.city = treatment.city
   and rule.appointment_type = treatment.appointment_type
  where treatment.is_active = true
    and treatment.deleted_at is null
    and treatment.allows_direct_booking = true
    and rule.is_active = true
    and rule.deleted_at is null
  on conflict (treatment_id, availability_rule_id) do update
  set is_active = true;
end $$;

notify pgrst, 'reload schema';
