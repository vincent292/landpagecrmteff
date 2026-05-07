alter table public.appointment_reservations
  add column if not exists payment_receipt_path text,
  add column if not exists payment_submitted_at timestamp,
  add column if not exists payment_verified_at timestamp,
  add column if not exists payment_expires_at timestamp default (now() + interval '1 day'),
  add column if not exists admin_notes text;

update public.appointment_reservations
set payment_expires_at = coalesce(payment_expires_at, created_at + interval '1 day')
where payment_expires_at is null;

alter table public.site_settings
  add column if not exists appointment_qr_payment_image text;

create or replace function public.expire_unpaid_appointment_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  update public.appointment_reservations
  set
    status = 'Cancelada',
    admin_notes = coalesce(admin_notes, 'Cancelada automaticamente por falta de comprobante en 24 horas.'),
    updated_at = now()
  where status = 'Pendiente'
    and payment_receipt_path is null
    and payment_expires_at is not null
    and payment_expires_at <= now();

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;
