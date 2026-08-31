-- Una regla puntual puede coincidir con una regla recurrente. Para un mismo
-- tratamiento eso duplicaba el mismo horario y, por tanto, duplicaba sus cupos.
-- La regla recurrente conserva los 2 cupos configurados; la puntual queda
-- disponible para otros usos, pero no se ofrece dos veces por WhatsApp.
with overlapping_specific_mappings as (
  select specific_mapping.treatment_id, specific_mapping.availability_rule_id
  from public.treatment_availability_rules specific_mapping
  join public.doctor_availability_rules specific_rule
    on specific_rule.id = specific_mapping.availability_rule_id
  where specific_mapping.is_active = true
    and specific_rule.is_active = true
    and specific_rule.deleted_at is null
    and specific_rule.availability_type = 'specific'
    and exists (
      select 1
      from public.doctor_availability_rules recurring_rule
      join public.treatment_availability_rules recurring_mapping
        on recurring_mapping.availability_rule_id = recurring_rule.id
       and recurring_mapping.treatment_id = specific_mapping.treatment_id
       and recurring_mapping.is_active = true
      where recurring_rule.is_active = true
        and recurring_rule.deleted_at is null
        and recurring_rule.availability_type = 'recurring'
        and recurring_rule.doctor_id is not distinct from specific_rule.doctor_id
        and recurring_rule.city is not distinct from specific_rule.city
        and recurring_rule.appointment_type is not distinct from specific_rule.appointment_type
        and recurring_rule.care_mode is not distinct from specific_rule.care_mode
        and recurring_rule.day_of_week = extract(dow from specific_rule.specific_date)::integer
        and (recurring_rule.start_date is null or recurring_rule.start_date <= specific_rule.specific_date)
        and (recurring_rule.end_date is null or recurring_rule.end_date >= specific_rule.specific_date)
        and recurring_rule.start_time <= specific_rule.start_time
        and recurring_rule.end_time >= specific_rule.end_time
    )
)
update public.treatment_availability_rules mapping
set is_active = false
from overlapping_specific_mappings duplicate
where mapping.treatment_id = duplicate.treatment_id
  and mapping.availability_rule_id = duplicate.availability_rule_id;
