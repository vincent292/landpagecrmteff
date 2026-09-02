create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_document text := public.normalize_document_number(new.raw_user_meta_data->>'document_number');
  requested_role text := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'patient');
  resolved_role text := requested_role;
  display_name text := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'preferred_username', '')), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Paciente'
  );
  matching_doctor public.doctor_profiles%rowtype;
begin
  if normalized_document is not null then
    select *
    into matching_doctor
    from public.doctor_profiles doctor_profile
    where doctor_profile.deleted_at is null
      and public.normalize_document_number(doctor_profile.document_number) = normalized_document
    order by doctor_profile.created_at
    limit 1;

    if matching_doctor.id is not null then
      if matching_doctor.profile_id is not null and matching_doctor.profile_id <> new.id then
        raise exception 'Este numero de carnet ya fue reclamado por otra cuenta de doctora.';
      end if;
      resolved_role := coalesce(matching_doctor.access_role, 'doctor');
    end if;
  end if;

  insert into public.profiles (id, full_name, email, phone, city, document_number, role)
  values (
    new.id,
    display_name,
    new.email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    normalized_document,
    resolved_role
  )
  on conflict (id) do update
  set
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    email = excluded.email,
    phone = excluded.phone,
    city = excluded.city,
    document_number = coalesce(excluded.document_number, public.profiles.document_number),
    role = excluded.role;

  return new;
end;
$$;

create or replace function public.sync_patient_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_document text := public.normalize_document_number(new.document_number);
  normalized_email text := lower(nullif(trim(coalesce(new.email, '')), ''));
  linked_patient public.patients%rowtype;
  linked_doctor public.doctor_profiles%rowtype;
begin
  if new.role in ('doctor', 'doctor_inventory') then
    if normalized_document is null then
      return new;
    end if;

    select *
    into linked_doctor
    from public.doctor_profiles doctor_profile
    where doctor_profile.deleted_at is null
      and (
        doctor_profile.profile_id = new.id
        or public.normalize_document_number(doctor_profile.document_number) = normalized_document
      )
    order by case when doctor_profile.profile_id = new.id then 0 else 1 end, doctor_profile.created_at
    limit 1;

    if linked_doctor.id is null then
      return new;
    end if;

    if linked_doctor.profile_id is not null and linked_doctor.profile_id <> new.id then
      raise exception 'Este numero de carnet ya fue reclamado por otra cuenta de doctora.';
    end if;

    update public.doctor_profiles
    set
      profile_id = new.id,
      full_name = coalesce(nullif(new.full_name, ''), public.doctor_profiles.full_name),
      phone = coalesce(new.phone, public.doctor_profiles.phone),
      email = coalesce(new.email, public.doctor_profiles.email),
      city = coalesce(new.city, public.doctor_profiles.city),
      document_number = normalized_document,
      access_role = case when new.role = 'doctor_inventory' then 'doctor_inventory' else 'doctor' end
    where id = linked_doctor.id;

    return new;
  end if;

  if new.role not in ('patient', 'student', 'user') then
    return new;
  end if;

  if normalized_document is null then
    select *
    into linked_patient
    from public.patients
    where profile_id = new.id
       or (
         normalized_email is not null
         and profile_id is null
         and lower(trim(coalesce(email, ''))) = normalized_email
       )
    order by case when profile_id = new.id then 0 else 1 end, created_at
    limit 1;

    if linked_patient.id is null then
      insert into public.patients (profile_id, full_name, phone, email, city, document_number)
      values (new.id, coalesce(nullif(new.full_name, ''), 'Paciente'), new.phone, new.email, new.city, null);
    else
      update public.patients
      set profile_id = coalesce(public.patients.profile_id, new.id),
          full_name = coalesce(nullif(new.full_name, ''), public.patients.full_name),
          phone = coalesce(new.phone, public.patients.phone),
          email = coalesce(new.email, public.patients.email),
          city = coalesce(new.city, public.patients.city)
      where id = linked_patient.id;
    end if;

    return new;
  end if;

  select *
  into linked_patient
  from public.patients
  where profile_id = new.id
     or public.normalize_document_number(document_number) = normalized_document
  order by case when profile_id = new.id then 0 else 1 end, created_at
  limit 1;

  if linked_patient.id is not null and linked_patient.profile_id is not null and linked_patient.profile_id <> new.id then
    raise exception 'Este numero de carnet ya fue reclamado por otra cuenta.';
  end if;

  if linked_patient.id is null then
    insert into public.patients (profile_id, full_name, phone, email, city, document_number)
    values (
      new.id,
      coalesce(nullif(new.full_name, ''), 'Paciente'),
      new.phone,
      new.email,
      new.city,
      normalized_document
    );
  else
    update public.patients
    set profile_id = coalesce(public.patients.profile_id, new.id),
        full_name = coalesce(nullif(new.full_name, ''), public.patients.full_name),
        phone = coalesce(new.phone, public.patients.phone),
        email = coalesce(new.email, public.patients.email),
        city = coalesce(new.city, public.patients.city),
        document_number = coalesce(normalized_document, public.patients.document_number)
    where id = linked_patient.id;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
