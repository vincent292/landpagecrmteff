alter table public.treatments
  add column if not exists requires_assessment boolean not null default false;

alter table public.promotions
  add column if not exists requires_assessment boolean not null default false;

alter table public.site_settings
  add column if not exists assessment_label text not null default 'Valoracion estetica',
  add column if not exists assessment_appointment_type text not null default 'Valoracion estetica',
  add column if not exists assessment_price numeric(12,2) not null default 0;

create or replace function public.create_public_assessment_reservation(
  p_content_type text,
  p_content_id uuid,
  p_content_title text,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_city text default null,
  p_document_number text default null,
  p_notes text default null,
  p_rule_id uuid default null,
  p_date date default null,
  p_start_time time default null,
  p_end_time time default null,
  p_payment_receipt_path text default null,
  p_payment_amount numeric default null,
  p_assessment_label text default null,
  p_appointment_type text default 'Valoracion estetica'
)
returns public.appointment_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_document text := public.normalize_document_number(p_document_number);
  current_user_id uuid := auth.uid();
  patient_row public.patients%rowtype;
  rule_row public.doctor_availability_rules%rowtype;
  current_start time;
  current_end time;
  slot_matches boolean := false;
  blocked boolean := false;
  taken_count int := 0;
  created_row public.appointment_reservations%rowtype;
  content_prefix text;
  final_title text;
  final_notes text;
begin
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Debes escribir el nombre completo.';
  end if;

  if coalesce(trim(p_phone), '') = '' then
    raise exception 'Debes escribir un celular o WhatsApp.';
  end if;

  if normalized_document is null then
    raise exception 'Debes escribir el numero de carnet.';
  end if;

  if p_rule_id is null or p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'Debes elegir un horario disponible.';
  end if;

  if coalesce(trim(p_payment_receipt_path), '') = '' then
    raise exception 'Debes subir el comprobante de pago.';
  end if;

  if current_user_id is not null then
    update public.profiles
    set
      full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
      phone = coalesce(nullif(trim(p_phone), ''), phone),
      email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
      city = coalesce(nullif(trim(coalesce(p_city, '')), ''), city),
      document_number = coalesce(normalized_document, document_number)
    where id = current_user_id;
  end if;

  select *
  into patient_row
  from public.patients
  where current_user_id is not null
    and profile_id = current_user_id
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

  if patient_row.id is not null and current_user_id is not null and patient_row.profile_id is not null and patient_row.profile_id <> current_user_id then
    raise exception 'Ese numero de carnet ya esta vinculado a otra cuenta.';
  end if;

  if patient_row.id is null then
    insert into public.patients (
      profile_id,
      full_name,
      phone,
      email,
      city,
      document_number
    )
    values (
      current_user_id,
      trim(p_full_name),
      trim(p_phone),
      nullif(trim(coalesce(p_email, '')), ''),
      nullif(trim(coalesce(p_city, '')), ''),
      normalized_document
    )
    returning * into patient_row;
  else
    update public.patients
    set
      profile_id = case
        when current_user_id is not null then coalesce(public.patients.profile_id, current_user_id)
        else public.patients.profile_id
      end,
      full_name = coalesce(nullif(trim(p_full_name), ''), public.patients.full_name),
      phone = coalesce(nullif(trim(p_phone), ''), public.patients.phone),
      email = coalesce(nullif(trim(coalesce(p_email, '')), ''), public.patients.email),
      city = coalesce(nullif(trim(coalesce(p_city, '')), ''), public.patients.city),
      document_number = coalesce(normalized_document, public.patients.document_number)
    where id = patient_row.id
    returning * into patient_row;
  end if;

  perform pg_advisory_xact_lock(hashtext(coalesce(p_rule_id::text, '') || p_date::text || coalesce(p_city, '') || coalesce(p_appointment_type, '') || p_start_time::text || p_end_time::text));

  select *
  into rule_row
  from public.doctor_availability_rules
  where id = p_rule_id
    and is_active = true
  for update;

  if not found then
    raise exception 'La disponibilidad seleccionada ya no esta activa.';
  end if;

  if lower(trim(coalesce(rule_row.city, ''))) <> lower(trim(coalesce(p_city, ''))) then
    raise exception 'La ciudad elegida no coincide con el horario.';
  end if;

  if lower(trim(coalesce(rule_row.appointment_type, ''))) <> lower(trim(coalesce(p_appointment_type, ''))) then
    raise exception 'El horario no corresponde a este tipo de valoracion.';
  end if;

  if not (
    (rule_row.availability_type = 'specific' and rule_row.specific_date = p_date)
    or (
      rule_row.availability_type = 'recurring'
      and rule_row.day_of_week = extract(dow from p_date)::int
      and (rule_row.start_date is null or rule_row.start_date <= p_date)
      and (rule_row.end_date is null or rule_row.end_date >= p_date)
    )
  ) then
    raise exception 'El horario no pertenece a esta disponibilidad.';
  end if;

  if p_date < current_date or (p_date = current_date and p_start_time <= current_time) then
    raise exception 'No puedes reservar un horario pasado.';
  end if;

  current_start := rule_row.start_time;
  loop
    current_end := ('2000-01-01'::date + current_start + make_interval(mins => rule_row.slot_duration_minutes))::time;
    exit when current_end > rule_row.end_time or current_end <= current_start;
    if current_start = p_start_time and current_end = p_end_time then
      slot_matches := true;
      exit;
    end if;
    current_start := ('2000-01-01'::date + current_start + make_interval(mins => rule_row.slot_duration_minutes + rule_row.break_minutes))::time;
  end loop;

  if not slot_matches then
    raise exception 'El horario seleccionado no es valido para esta disponibilidad.';
  end if;

  select exists (
    select 1
    from public.availability_blocks b
    where b.is_active = true
      and b.block_date = p_date
      and (b.doctor_id is null or b.doctor_id = rule_row.doctor_id)
      and (
        b.city is null
        or lower(trim(coalesce(b.city, ''))) = lower(trim(coalesce(p_city, '')))
      )
      and (
        (b.start_time is null and b.end_time is null)
        or (p_start_time < b.end_time and p_end_time > b.start_time)
      )
  ) into blocked;

  if blocked then
    raise exception 'Este horario fue bloqueado por administracion.';
  end if;

  select count(*)::int
  into taken_count
  from public.appointment_reservations ar
  where ar.appointment_date = p_date
    and lower(trim(coalesce(ar.city, ''))) = lower(trim(coalesce(p_city, '')))
    and lower(trim(coalesce(ar.appointment_type, ''))) = lower(trim(coalesce(p_appointment_type, '')))
    and ar.start_time = p_start_time
    and ar.end_time = p_end_time
    and (ar.doctor_id is null or ar.doctor_id = rule_row.doctor_id)
    and ar.status in ('Pendiente', 'Confirmada', 'Realizada');

  if taken_count >= rule_row.capacity_per_slot then
    raise exception 'Este horario ya no esta disponible.';
  end if;

  content_prefix := case lower(trim(coalesce(p_content_type, '')))
    when 'promotion' then 'Valoracion previa de promocion'
    when 'treatment' then 'Valoracion previa de tratamiento'
    else 'Valoracion estetica'
  end;

  final_title := coalesce(nullif(trim(coalesce(p_assessment_label, '')), ''), content_prefix);
  final_notes := concat_ws(
    E'\n',
    case when nullif(trim(coalesce(p_notes, '')), '') is not null then trim(p_notes) end,
    case when nullif(trim(coalesce(p_content_title, '')), '') is not null then concat('Contexto: ', p_content_title) end,
    case when p_content_id is not null then concat('Referencia: ', lower(trim(coalesce(p_content_type, 'general'))), ' ', p_content_id::text) end
  );

  insert into public.appointment_reservations (
    patient_id,
    user_id,
    availability_rule_id,
    doctor_id,
    title,
    appointment_type,
    city,
    location,
    appointment_date,
    start_time,
    end_time,
    status,
    source,
    notes,
    created_by,
    payment_receipt_path,
    payment_submitted_at,
    payment_expires_at,
    payment_amount
  )
  values (
    patient_row.id,
    current_user_id,
    p_rule_id,
    rule_row.doctor_id,
    final_title,
    p_appointment_type,
    p_city,
    rule_row.location,
    p_date,
    p_start_time,
    p_end_time,
    'Pendiente',
    case lower(trim(coalesce(p_content_type, '')))
      when 'promotion' then 'assessment_promotion'
      when 'treatment' then 'assessment_treatment'
      else 'assessment_public'
    end,
    nullif(final_notes, ''),
    case when public.is_staff() then current_user_id else null end,
    p_payment_receipt_path,
    now(),
    now() + interval '1 day',
    p_payment_amount
  )
  returning * into created_row;

  return created_row;
end;
$$;

grant execute on function public.create_public_assessment_reservation(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  date,
  time,
  time,
  text,
  numeric,
  text,
  text
) to anon, authenticated;

notify pgrst, 'reload schema';
