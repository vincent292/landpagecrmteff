alter table public.profiles
  add column if not exists document_number text;

alter table public.patients
  add column if not exists document_number text;

alter table public.course_enrollments
  add column if not exists document_number text;

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
    nullif(new.raw_user_meta_data->>'document_number', ''),
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
begin
  if new.role in ('patient', 'student', 'user') then
    insert into public.patients (profile_id, full_name, phone, email, city, document_number)
    values (new.id, coalesce(new.full_name, ''), new.phone, new.email, new.city, new.document_number)
    on conflict do nothing;

    update public.patients
    set
      full_name = coalesce(new.full_name, public.patients.full_name),
      phone = coalesce(new.phone, public.patients.phone),
      email = coalesce(new.email, public.patients.email),
      city = coalesce(new.city, public.patients.city),
      document_number = coalesce(new.document_number, public.patients.document_number)
    where profile_id = new.id;
  end if;
  return new;
end;
$$;

drop policy if exists "Users update own enrollments" on public.course_enrollments;
create policy "Users update own enrollments" on public.course_enrollments
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
