alter table public.treatments
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.promotions
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.courses
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.calendar_events
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.information_requests
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null;

alter table public.availability_blocks
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null;

create index if not exists treatments_doctor_idx on public.treatments(doctor_id);
create index if not exists promotions_doctor_idx on public.promotions(doctor_id);
create index if not exists courses_doctor_idx on public.courses(doctor_id);
create index if not exists calendar_events_doctor_idx on public.calendar_events(doctor_id);
create index if not exists information_requests_doctor_idx on public.information_requests(doctor_id);
create index if not exists availability_blocks_doctor_idx on public.availability_blocks(doctor_id);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('superadmin', 'doctor', 'admin')
  );
$$;

create or replace function public.book_appointment_slot(
  p_user_id uuid,
  p_patient_id uuid,
  p_rule_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_city text,
  p_appointment_type text,
  p_notes text default null
)
returns public.appointment_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  rule_row public.doctor_availability_rules%rowtype;
  current_start time;
  current_end time;
  slot_matches boolean := false;
  blocked boolean := false;
  taken_count int := 0;
  created public.appointment_reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion para reservar.';
  end if;

  if auth.uid() <> p_user_id and not public.is_staff() then
    raise exception 'No tienes permiso para reservar por otro usuario.';
  end if;

  if not public.is_staff() and not exists (
    select 1 from public.patients where id = p_patient_id and profile_id = auth.uid()
  ) then
    raise exception 'No tienes permiso para este paciente.';
  end if;

  perform pg_advisory_xact_lock(hashtext(coalesce(p_rule_id::text, '') || p_date::text || p_city || p_appointment_type || p_start_time::text || p_end_time::text));

  select *
  into rule_row
  from public.doctor_availability_rules
  where id = p_rule_id
    and is_active = true
    and city = p_city
    and appointment_type = p_appointment_type
  for update;

  if not found then
    raise exception 'La disponibilidad seleccionada ya no esta activa.';
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
      and (b.city is null or b.city = p_city)
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
    and ar.city = p_city
    and ar.appointment_type = p_appointment_type
    and ar.start_time = p_start_time
    and ar.end_time = p_end_time
    and (ar.doctor_id is null or ar.doctor_id = rule_row.doctor_id)
    and ar.status in ('Pendiente', 'Confirmada', 'Realizada');

  if taken_count >= rule_row.capacity_per_slot then
    raise exception 'Este horario ya no esta disponible.';
  end if;

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
    created_by
  )
  values (
    p_patient_id,
    p_user_id,
    p_rule_id,
    rule_row.doctor_id,
    p_appointment_type,
    p_appointment_type,
    p_city,
    rule_row.location,
    p_date,
    p_start_time,
    p_end_time,
    'Pendiente',
    case when public.is_staff() then 'admin' else 'patient' end,
    p_notes,
    case when public.is_staff() then auth.uid() else null end
  )
  returning * into created;

  return created;
end;
$$;

create or replace function public.can_access_patient(patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff()
    or exists (
      select 1
      from public.patients p
      where p.id = patient_id
        and p.profile_id = auth.uid()
    );
$$;

create or replace function public.assign_current_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_jsonb(new) ? 'created_by' and new.created_by is null then
    new.created_by := auth.uid();
  end if;

  if to_jsonb(new) ? 'uploaded_by' and new.uploaded_by is null then
    new.uploaded_by := auth.uid();
  end if;

  if to_jsonb(new) ? 'doctor_id' and new.doctor_id is null and public.current_doctor_profile_id() is not null then
    new.doctor_id := public.current_doctor_profile_id();
  end if;

  return new;
end;
$$;

create or replace function public.assign_information_request_doctor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.doctor_id is not null or new.interest_id is null then
    return new;
  end if;

  if new.interest_type = 'Tratamiento' then
    select doctor_id into new.doctor_id
    from public.treatments
    where id = new.interest_id::uuid;
  elsif new.interest_type in ('Promoción', 'Promocion') then
    select doctor_id into new.doctor_id
    from public.promotions
    where id = new.interest_id::uuid;
  elsif new.interest_type = 'Curso' then
    select doctor_id into new.doctor_id
    from public.courses
    where id = new.interest_id::uuid;
  elsif new.interest_type = 'Evento' then
    select doctor_id into new.doctor_id
    from public.calendar_events
    where id = new.interest_id::uuid;
  end if;

  return new;
exception
  when invalid_text_representation then
    return new;
end;
$$;

drop trigger if exists assign_information_request_doctor on public.information_requests;
create trigger assign_information_request_doctor before insert on public.information_requests
for each row execute function public.assign_information_request_doctor();

drop trigger if exists assign_actor_treatments on public.treatments;
create trigger assign_actor_treatments before insert on public.treatments
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_promotions on public.promotions;
create trigger assign_actor_promotions before insert on public.promotions
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_courses on public.courses;
create trigger assign_actor_courses before insert on public.courses
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_calendar_events on public.calendar_events;
create trigger assign_actor_calendar_events before insert on public.calendar_events
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_clinical_histories on public.clinical_histories;
create trigger assign_actor_clinical_histories before insert on public.clinical_histories
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_clinical_evolutions on public.clinical_evolutions;
create trigger assign_actor_clinical_evolutions before insert on public.clinical_evolutions
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_patient_photos on public.patient_photos;
create trigger assign_actor_patient_photos before insert on public.patient_photos
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_photo_comparisons on public.photo_comparisons;
create trigger assign_actor_photo_comparisons before insert on public.photo_comparisons
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_appointments on public.appointments;
create trigger assign_actor_appointments before insert on public.appointments
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_availability_blocks on public.availability_blocks;
create trigger assign_actor_availability_blocks before insert on public.availability_blocks
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_patient_prescriptions on public.patient_prescriptions;
create trigger assign_actor_patient_prescriptions before insert on public.patient_prescriptions
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_post_treatment_cares on public.post_treatment_cares;
create trigger assign_actor_post_treatment_cares before insert on public.post_treatment_cares
for each row execute function public.assign_current_actor();

drop policy if exists "Staff can manage treatments" on public.treatments;
create policy "Admin or owning doctor manage treatments"
on public.treatments
for all
using (public.is_admin_staff() or public.can_access_doctor(doctor_id))
with check (public.is_admin_staff() or public.can_access_doctor(doctor_id));

drop policy if exists "Staff can manage promotions" on public.promotions;
create policy "Admin or owning doctor manage promotions"
on public.promotions
for all
using (public.is_admin_staff() or public.can_access_doctor(doctor_id))
with check (public.is_admin_staff() or public.can_access_doctor(doctor_id));

drop policy if exists "Staff can manage courses" on public.courses;
create policy "Admin or owning doctor manage courses"
on public.courses
for all
using (public.is_admin_staff() or public.can_access_doctor(doctor_id))
with check (public.is_admin_staff() or public.can_access_doctor(doctor_id));

drop policy if exists "Staff manage events" on public.calendar_events;
drop policy if exists "Staff can manage events" on public.calendar_events;
create policy "Admin or owning doctor manage events"
on public.calendar_events
for all
using (public.is_admin_staff() or public.can_access_doctor(doctor_id))
with check (public.is_admin_staff() or public.can_access_doctor(doctor_id));

drop policy if exists "Staff manage requests" on public.information_requests;
drop policy if exists "Staff can manage requests" on public.information_requests;
create policy "Admin or owning doctor manage requests"
on public.information_requests
for all
using (public.is_admin_staff() or public.can_access_doctor(doctor_id))
with check (public.is_admin_staff() or public.can_access_doctor(doctor_id));

drop policy if exists "Staff manage enrollments" on public.course_enrollments;
drop policy if exists "Staff can manage enrollments" on public.course_enrollments;
create policy "Admin or course doctor manage enrollments"
on public.course_enrollments
for all
using (
  public.is_admin_staff()
  or exists (
    select 1
    from public.courses c
    where c.id = course_id
      and public.can_access_doctor(c.doctor_id)
  )
)
with check (
  public.is_admin_staff()
  or exists (
    select 1
    from public.courses c
    where c.id = course_id
      and public.can_access_doctor(c.doctor_id)
  )
);

drop policy if exists "Staff manage doctor profiles" on public.doctor_profiles;
create policy "Admin manage doctor profiles"
on public.doctor_profiles
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Staff manage site settings" on public.site_settings;
create policy "Admin manage site settings"
on public.site_settings
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Staff manage albums" on public.gallery_albums;
drop policy if exists "Staff can manage albums" on public.gallery_albums;
create policy "Admin manage albums"
on public.gallery_albums
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Staff manage gallery images" on public.gallery_images;
drop policy if exists "Staff can manage gallery images" on public.gallery_images;
create policy "Admin manage gallery images"
on public.gallery_images
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Staff manage books" on public.books;
create policy "Admin manage books"
on public.books
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Staff manage book orders" on public.book_orders;
create policy "Admin manage book orders"
on public.book_orders
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Staff manage book tokens" on public.book_download_tokens;
create policy "Admin manage book tokens"
on public.book_download_tokens
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Staff manage book download logs" on public.book_download_logs;
create policy "Admin manage book download logs"
on public.book_download_logs
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Staff manage availability blocks" on public.availability_blocks;
create policy "Admin or owning doctor manage availability blocks"
on public.availability_blocks
for all
using (public.is_admin_staff() or public.can_access_doctor(doctor_id))
with check (public.is_admin_staff() or public.can_access_doctor(doctor_id));

drop policy if exists "Admin doctor or owner read patients" on public.patients;
drop policy if exists "Admin or assigned doctor manage patients" on public.patients;
create policy "Staff or owner read patients"
on public.patients
for select
using (public.is_staff() or profile_id = auth.uid());

create policy "Staff manage patients"
on public.patients
for all
using (public.is_staff())
with check (public.is_staff());

create or replace function public.get_available_slots(
  p_city text,
  p_appointment_type text,
  p_date_from date,
  p_date_to date
)
returns table (
  rule_id uuid,
  date date,
  start_time time,
  end_time time,
  city text,
  location text,
  appointment_type text,
  available_capacity int,
  total_capacity int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d date;
  rule_row public.doctor_availability_rules%rowtype;
  slot_start time;
  slot_end time;
  taken_count int;
  blocked boolean;
begin
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    return;
  end if;

  for d in
    select generate_series(p_date_from, p_date_to, interval '1 day')::date
  loop
    for rule_row in
      select *
      from public.doctor_availability_rules r
      where r.is_active = true
        and (p_city is null or p_city = '' or r.city = p_city)
        and (p_appointment_type is null or p_appointment_type = '' or r.appointment_type = p_appointment_type)
        and (
          (r.availability_type = 'specific' and r.specific_date = d)
          or (
            r.availability_type = 'recurring'
            and r.day_of_week = extract(dow from d)::int
            and (r.start_date is null or r.start_date <= d)
            and (r.end_date is null or r.end_date >= d)
          )
        )
    loop
      slot_start := rule_row.start_time;
      loop
        slot_end := ('2000-01-01'::date + slot_start + make_interval(mins => rule_row.slot_duration_minutes))::time;
        exit when slot_end > rule_row.end_time or slot_end <= slot_start;

        if d > current_date or (d = current_date and slot_start > current_time) then
          select exists (
            select 1
            from public.availability_blocks b
            where b.is_active = true
              and b.block_date = d
              and (b.doctor_id is null or b.doctor_id = rule_row.doctor_id)
              and (b.city is null or b.city = rule_row.city)
              and (
                (b.start_time is null and b.end_time is null)
                or (slot_start < b.end_time and slot_end > b.start_time)
              )
          ) into blocked;

          if not blocked then
            select count(*)::int
            from public.appointment_reservations ar
            where ar.appointment_date = d
              and ar.city = rule_row.city
              and ar.appointment_type = rule_row.appointment_type
              and ar.start_time = slot_start
              and ar.end_time = slot_end
              and (ar.doctor_id is null or ar.doctor_id = rule_row.doctor_id)
              and ar.status in ('Pendiente', 'Confirmada', 'Realizada')
            into taken_count;

            if taken_count < rule_row.capacity_per_slot then
              rule_id := rule_row.id;
              date := d;
              start_time := slot_start;
              end_time := slot_end;
              city := rule_row.city;
              location := rule_row.location;
              appointment_type := rule_row.appointment_type;
              available_capacity := rule_row.capacity_per_slot - taken_count;
              total_capacity := rule_row.capacity_per_slot;
              return next;
            end if;
          end if;
        end if;

        slot_start := ('2000-01-01'::date + slot_start + make_interval(mins => rule_row.slot_duration_minutes + rule_row.break_minutes))::time;
      end loop;
    end loop;
  end loop;
end;
$$;
