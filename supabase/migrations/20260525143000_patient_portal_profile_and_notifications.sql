alter table public.patients
  add column if not exists address text,
  add column if not exists emergency_contact_relationship text;

create or replace function public.upsert_patient_profile_from_portal(
  p_full_name text,
  p_phone text default null,
  p_email text default null,
  p_city text default null,
  p_document_number text default null,
  p_birth_date date default null,
  p_gender text default null,
  p_emergency_contact text default null,
  p_emergency_contact_relationship text default null,
  p_address text default null,
  p_notes text default null
)
returns public.patients
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_document text := public.normalize_document_number(p_document_number);
  patient_row public.patients%rowtype;
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesion para actualizar tu perfil.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Debes escribir tu nombre completo.';
  end if;

  if normalized_document is null then
    raise exception 'Debes escribir tu numero de carnet.';
  end if;

  update public.profiles
  set
    full_name = trim(p_full_name),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
    city = nullif(trim(coalesce(p_city, '')), ''),
    document_number = normalized_document
  where id = current_user_id;

  select *
  into patient_row
  from public.patients
  where profile_id = current_user_id
    and coalesce(is_deleted, false) = false
  limit 1;

  if patient_row.id is null then
    select *
    into patient_row
    from public.patients
    where public.normalize_document_number(document_number) = normalized_document
      and coalesce(is_deleted, false) = false
    order by case when profile_id is null then 0 else 1 end, created_at
    limit 1;
  end if;

  if patient_row.id is not null and patient_row.profile_id is not null and patient_row.profile_id <> current_user_id then
    raise exception 'Ese numero de carnet ya esta vinculado a otra cuenta.';
  end if;

  if patient_row.id is null then
    insert into public.patients (
      profile_id,
      full_name,
      phone,
      email,
      city,
      document_number,
      birth_date,
      gender,
      emergency_contact,
      emergency_contact_relationship,
      address,
      notes
    )
    values (
      current_user_id,
      trim(p_full_name),
      nullif(trim(coalesce(p_phone, '')), ''),
      nullif(trim(coalesce(p_email, '')), ''),
      nullif(trim(coalesce(p_city, '')), ''),
      normalized_document,
      p_birth_date,
      nullif(trim(coalesce(p_gender, '')), ''),
      nullif(trim(coalesce(p_emergency_contact, '')), ''),
      nullif(trim(coalesce(p_emergency_contact_relationship, '')), ''),
      nullif(trim(coalesce(p_address, '')), ''),
      nullif(trim(coalesce(p_notes, '')), '')
    )
    returning * into patient_row;
  else
    update public.patients
    set
      profile_id = coalesce(public.patients.profile_id, current_user_id),
      full_name = trim(p_full_name),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      email = coalesce(nullif(trim(coalesce(p_email, '')), ''), public.patients.email),
      city = nullif(trim(coalesce(p_city, '')), ''),
      document_number = normalized_document,
      birth_date = p_birth_date,
      gender = nullif(trim(coalesce(p_gender, '')), ''),
      emergency_contact = nullif(trim(coalesce(p_emergency_contact, '')), ''),
      emergency_contact_relationship = nullif(trim(coalesce(p_emergency_contact_relationship, '')), ''),
      address = nullif(trim(coalesce(p_address, '')), ''),
      notes = nullif(trim(coalesce(p_notes, '')), '')
    where id = patient_row.id
    returning * into patient_row;
  end if;

  return patient_row;
end;
$$;

grant execute on function public.upsert_patient_profile_from_portal(
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text
) to authenticated;

create or replace function public.submit_patient_reservation_receipt(
  p_reservation_id uuid,
  p_payment_receipt_path text
)
returns public.appointment_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  reservation_row public.appointment_reservations%rowtype;
  trimmed_receipt_path text := nullif(trim(coalesce(p_payment_receipt_path, '')), '');
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesion para subir el comprobante.';
  end if;

  if trimmed_receipt_path is null then
    raise exception 'Debes subir un comprobante valido.';
  end if;

  select *
  into reservation_row
  from public.appointment_reservations
  where id = p_reservation_id
    and user_id = current_user_id
    and coalesce(is_deleted, false) = false
  for update;

  if reservation_row.id is null then
    raise exception 'No encontramos esa reserva en tu cuenta.';
  end if;

  if reservation_row.status not in ('Pendiente', 'Rechazada') then
    raise exception 'Esta reserva ya no acepta nuevos comprobantes.';
  end if;

  update public.appointment_reservations
  set
    payment_receipt_path = trimmed_receipt_path,
    payment_submitted_at = now(),
    payment_verified_at = null,
    payment_method = null,
    admin_notes = null,
    status = 'Pendiente'
  where id = reservation_row.id
  returning * into reservation_row;

  return reservation_row;
end;
$$;

grant execute on function public.submit_patient_reservation_receipt(uuid, text) to authenticated;

notify pgrst, 'reload schema';
