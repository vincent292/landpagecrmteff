create or replace function public.crm_handle_booking_rejection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.crm_booking_sessions%rowtype;
  contact_row public.crm_contacts%rowtype;
  treatment_title text;
  settings_row public.crm_settings%rowtype;
  rejection_body text;
begin
  if new.status not in ('Rechazado', 'Cancelado') or old.status = new.status then return new; end if;

  select * into session_row from public.crm_booking_sessions where treatment_order_id = new.id limit 1;
  if session_row.id is null then return new; end if;

  select * into contact_row from public.crm_contacts where id = session_row.contact_id;
  select title into treatment_title from public.treatments where id = session_row.treatment_id;
  select * into settings_row from public.crm_settings where id = true;

  update public.appointment_reservations
  set status = case when new.status = 'Rechazado' then 'Rechazada' else 'Cancelada' end,
      admin_notes = coalesce(new.admin_notes, admin_notes), updated_at = now()
  where id = session_row.appointment_reservation_id and status = 'Pendiente';

  update public.crm_booking_sessions
  set status = case when new.status = 'Rechazado' then 'rejected' else 'cancelled' end, updated_at = now()
  where id = session_row.id;

  if new.status = 'Rechazado' then
    update public.crm_payment_submissions
    set status = 'rejected', review_notes = new.admin_notes, reviewed_by = auth.uid(), reviewed_at = now()
    where booking_session_id = session_row.id and status = 'pending';

    rejection_body := format(
      'Hola %s, revisamos el comprobante de %s y no pudimos aprobarlo. Motivo: %s. Responde a este mensaje para que administración te ayude a reenviarlo o coordinar otra opción.',
      coalesce(session_row.full_name, contact_row.full_name, 'paciente'),
      coalesce(treatment_title, 'tu tratamiento'), coalesce(nullif(trim(new.admin_notes), ''), 'requiere verificación')
    );
    insert into public.crm_notification_outbox (
      idempotency_key, booking_session_id, conversation_id, recipient_kind, recipient_wa_id,
      body, template_name, template_language, template_parameters
    ) values (
      'booking-rejected-patient:' || session_row.id, session_row.id, session_row.conversation_id,
      'patient', contact_row.wa_id, rejection_body, settings_row.payment_rejected_template,
      settings_row.template_language,
      jsonb_build_array(coalesce(session_row.full_name, contact_row.full_name, 'Paciente'),
        coalesce(treatment_title, 'Tratamiento'), coalesce(nullif(trim(new.admin_notes), ''), 'Requiere verificación'))
    ) on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists crm_treatment_order_rejection on public.treatment_orders;
create trigger crm_treatment_order_rejection
after update of status on public.treatment_orders
for each row execute function public.crm_handle_booking_rejection();

revoke execute on function public.crm_handle_booking_rejection() from public, anon, authenticated;
