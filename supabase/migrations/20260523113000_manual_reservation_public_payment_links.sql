alter table public.appointment_reservations
  add column if not exists public_payment_token text,
  add column if not exists public_payment_token_expires_at timestamptz,
  add column if not exists payment_link_sent_at timestamptz;

create unique index if not exists appointment_reservations_public_payment_token_idx
on public.appointment_reservations(public_payment_token)
where public_payment_token is not null;

create index if not exists appointment_reservations_public_payment_token_expires_idx
on public.appointment_reservations(public_payment_token_expires_at)
where public_payment_token_expires_at is not null;

create or replace function public.get_manual_reservation_payment_by_token(
  p_token text
)
returns table (
  reservation_id uuid,
  patient_name text,
  patient_phone text,
  patient_email text,
  patient_city text,
  patient_document_number text,
  appointment_title text,
  appointment_type text,
  appointment_date date,
  start_time time,
  end_time time,
  location text,
  doctor_name text,
  payment_amount numeric,
  payment_expires_at timestamptz,
  payment_receipt_path text,
  status text
)
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

  select ar.*
  into reservation_row
  from public.appointment_reservations ar
  where ar.public_payment_token = upper(trim(p_token))
    and coalesce(ar.is_deleted, false) = false
    and ar.source = 'admin_manual'
  limit 1;

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

  return query
  select
    reservation_row.id,
    patients.full_name,
    patients.phone,
    patients.email,
    coalesce(reservation_row.city, patients.city),
    patients.document_number,
    coalesce(reservation_row.title, reservation_row.appointment_type),
    reservation_row.appointment_type,
    reservation_row.appointment_date,
    reservation_row.start_time,
    reservation_row.end_time,
    reservation_row.location,
    doctor_profiles.full_name,
    reservation_row.payment_amount,
    coalesce(reservation_row.public_payment_token_expires_at, reservation_row.payment_expires_at),
    reservation_row.payment_receipt_path,
    reservation_row.status
  from public.patients
  left join public.doctor_profiles on doctor_profiles.id = reservation_row.doctor_id
  where patients.id = reservation_row.patient_id;
end;
$$;

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
    updated_at = now()
  where id = reservation_row.id
  returning * into reservation_row;

  return reservation_row;
end;
$$;

grant execute on function public.get_manual_reservation_payment_by_token(text) to anon, authenticated;
grant execute on function public.submit_manual_reservation_payment_by_token(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
