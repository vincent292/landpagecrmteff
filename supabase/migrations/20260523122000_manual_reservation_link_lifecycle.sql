create or replace function public.submit_manual_reservation_payment_by_token(
  p_token text,
  p_payment_receipt_path text
)
returns public.appointment_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row public.appointment_reservations%rowtype;
begin
  if nullif(trim(coalesce(p_token, '')), '') is null then
    raise exception 'Token invalido.';
  end if;

  if nullif(trim(coalesce(p_payment_receipt_path, '')), '') is null then
    raise exception 'Debes subir un comprobante antes de continuar.';
  end if;

  select ar.*
  into reservation_row
  from public.appointment_reservations ar
  where ar.public_payment_token = upper(trim(p_token))
    and coalesce(ar.is_deleted, false) = false
    and ar.source = 'admin_manual'
  limit 1
  for update;

  if reservation_row.id is null then
    raise exception 'No encontramos una reserva manual asociada a ese enlace.';
  end if;

  if reservation_row.status <> 'Pendiente' then
    raise exception 'Esta reserva ya no esta pendiente de pago.';
  end if;

  if reservation_row.public_payment_token_expires_at is not null
    and reservation_row.public_payment_token_expires_at <= now() then
    raise exception 'Este enlace de pago ya vencio.';
  end if;

  update public.appointment_reservations
  set
    payment_receipt_path = p_payment_receipt_path,
    payment_submitted_at = now(),
    public_payment_token = null,
    public_payment_token_expires_at = null,
    updated_at = now()
  where id = reservation_row.id
  returning * into reservation_row;

  return reservation_row;
end;
$$;

notify pgrst, 'reload schema';
