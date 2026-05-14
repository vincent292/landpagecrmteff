update public.promotions
set
  agenda_mode = 'choose_slot',
  appointment_type = coalesce(nullif(trim(appointment_type), ''), 'Promocion directa')
where allows_direct_booking = true
  and coalesce(nullif(trim(agenda_mode), ''), 'coordinate') = 'coordinate';

notify pgrst, 'reload schema';
