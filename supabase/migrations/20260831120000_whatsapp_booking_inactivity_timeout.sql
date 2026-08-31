-- Una reserva iniciada por WhatsApp no puede continuar luego de 20 minutos sin interacción.
-- El comprobante ya enviado (payment_review) queda fuera de este vencimiento porque espera revisión humana.

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
    set status = 'expired',
        state_data = coalesce(state_data, '{}'::jsonb) || jsonb_build_object(
          'expired_reason', case
            when status = 'awaiting_payment' and hold_expires_at is not null and hold_expires_at <= now() then 'payment_timeout'
            else 'inactivity'
          end
        ),
        updated_at = now()
    where (
      status in ('collecting_identity', 'choosing_date', 'choosing_time')
      and updated_at <= now() - interval '20 minutes'
    ) or (
      status = 'awaiting_payment'
      and payment_receipt_path is null
      and (hold_expires_at <= now() or updated_at <= now() - interval '20 minutes')
    )
    returning conversation_id, appointment_reservation_id, treatment_order_id
  ), cleared_conversations as (
    update public.crm_conversations conversation
    set intent = null
    where conversation.id in (select conversation_id from expired)
    returning conversation.id
  ), cancelled_reservations as (
    update public.appointment_reservations reservation
    set status = 'Cancelada',
        admin_notes = coalesce(reservation.admin_notes, 'Proceso de reserva por WhatsApp vencido por inactividad.'),
        updated_at = now()
    where reservation.id in (select appointment_reservation_id from expired where appointment_reservation_id is not null)
      and reservation.status = 'Pendiente'
    returning reservation.id
  ), cancelled_orders as (
    update public.treatment_orders orders
    set status = 'Cancelado',
        admin_notes = coalesce(orders.admin_notes, 'Proceso de reserva por WhatsApp vencido por inactividad.'),
        updated_at = now()
    where orders.id in (select treatment_order_id from expired where treatment_order_id is not null)
      and orders.status = 'Pendiente'
    returning orders.id
  )
  select count(*)::integer into affected_count from expired;
  return affected_count;
end;
$$;
