update public.treatments treatment
set
  doctor_id = selected_rule.doctor_id,
  city = selected_rule.city,
  appointment_type = selected_rule.appointment_type,
  agenda_tag = selected_rule.agenda_tag,
  agenda_mode = 'choose_slot',
  allows_direct_booking = true,
  treatment_price = 1
from lateral (
  select rule.*
  from public.doctor_availability_rules rule
  where rule.is_active = true
    and rule.deleted_at is null
    and rule.doctor_id is not null
    and (
      (rule.availability_type = 'recurring' and (rule.end_date is null or rule.end_date >= current_date))
      or (rule.availability_type = 'specific' and rule.specific_date >= current_date)
    )
  order by
    case when rule.appointment_type = 'Procedimiento' then 0 else 1 end,
    case when rule.availability_type = 'recurring' then 0 else 1 end,
    rule.created_at
  limit 1
) selected_rule
where treatment.slug = 'prueba-reserva-whatsapp';

insert into public.treatment_availability_rules (treatment_id, availability_rule_id)
select treatment.id, rule.id
from public.treatments treatment
join public.doctor_availability_rules rule
  on rule.doctor_id = treatment.doctor_id
 and rule.city = treatment.city
 and rule.appointment_type = treatment.appointment_type
where treatment.slug = 'prueba-reserva-whatsapp'
  and rule.is_active = true
  and rule.deleted_at is null
on conflict (treatment_id, availability_rule_id) do update set is_active = true;
