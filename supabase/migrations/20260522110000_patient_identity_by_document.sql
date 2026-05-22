create or replace function public.normalize_document_number(value text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(coalesce(value, ''), '[^0-9A-Za-z]+', '', 'g')), '')
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, city, document_number, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    public.normalize_document_number(new.raw_user_meta_data->>'document_number'),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'patient')
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    city = excluded.city,
    document_number = coalesce(excluded.document_number, public.profiles.document_number);
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
  linked_patient public.patients%rowtype;
begin
  if new.role not in ('patient', 'student', 'user') then
    return new;
  end if;

  select *
  into linked_patient
  from public.patients
  where profile_id = new.id
    and coalesce(is_deleted, false) = false
  order by created_at
  limit 1;

  if linked_patient.id is null and normalized_document is not null then
    select *
    into linked_patient
    from public.patients
    where public.normalize_document_number(document_number) = normalized_document
      and coalesce(is_deleted, false) = false
    order by case when profile_id is null then 0 else 1 end, created_at
    limit 1;
  end if;

  if linked_patient.id is not null and linked_patient.profile_id is not null and linked_patient.profile_id <> new.id then
    raise exception 'El numero de carnet ya esta vinculado a otra cuenta.';
  end if;

  if linked_patient.id is null then
    insert into public.patients (profile_id, full_name, phone, email, city, document_number)
    values (
      new.id,
      coalesce(new.full_name, ''),
      new.phone,
      new.email,
      new.city,
      normalized_document
    );
  else
    update public.patients
    set
      profile_id = coalesce(public.patients.profile_id, new.id),
      full_name = coalesce(new.full_name, public.patients.full_name),
      phone = coalesce(new.phone, public.patients.phone),
      email = coalesce(new.email, public.patients.email),
      city = coalesce(new.city, public.patients.city),
      document_number = coalesce(normalized_document, public.patients.document_number)
    where id = linked_patient.id;
  end if;

  new.document_number := normalized_document;
  return new;
end;
$$;

update public.patients patients
set
  profile_id = profiles.id,
  full_name = coalesce(profiles.full_name, patients.full_name),
  phone = coalesce(profiles.phone, patients.phone),
  email = coalesce(profiles.email, patients.email),
  city = coalesce(profiles.city, patients.city),
  document_number = coalesce(public.normalize_document_number(profiles.document_number), patients.document_number)
from public.profiles profiles
where patients.profile_id is null
  and coalesce(patients.is_deleted, false) = false
  and public.normalize_document_number(patients.document_number) is not null
  and public.normalize_document_number(patients.document_number) = public.normalize_document_number(profiles.document_number)
  and not exists (
    select 1
    from public.patients linked
    where linked.profile_id = profiles.id
      and coalesce(linked.is_deleted, false) = false
  );

update public.profiles
set document_number = public.normalize_document_number(document_number)
where document_number is not null;

update public.patients
set document_number = public.normalize_document_number(document_number)
where document_number is not null;

update public.course_enrollments
set document_number = public.normalize_document_number(document_number)
where document_number is not null;

update public.promotion_orders
set document_number = public.normalize_document_number(document_number)
where document_number is not null;

create index if not exists profiles_document_number_idx
on public.profiles ((public.normalize_document_number(document_number)))
where document_number is not null;

create index if not exists patients_document_number_idx
on public.patients ((public.normalize_document_number(document_number)))
where document_number is not null;
