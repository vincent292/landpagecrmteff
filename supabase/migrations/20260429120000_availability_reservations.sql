create table if not exists public.doctor_availability_rules (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  city text not null,
  location text,
  appointment_type text not null,
  availability_type text not null default 'recurring',
  start_date date,
  end_date date,
  specific_date date,
  day_of_week int,
  start_time time not null,
  end_time time not null,
  slot_duration_minutes int default 30,
  break_minutes int default 0,
  capacity_per_slot int default 1,
  is_active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  constraint doctor_availability_type_check check (availability_type in ('recurring', 'specific')),
  constraint doctor_availability_time_check check (start_time < end_time),
  constraint doctor_availability_duration_check check (slot_duration_minutes > 0),
  constraint doctor_availability_break_check check (break_minutes >= 0),
  constraint doctor_availability_capacity_check check (capacity_per_slot > 0),
  constraint doctor_availability_day_check check (day_of_week is null or day_of_week between 0 and 6)
);

create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  city text,
  block_date date not null,
  start_time time,
  end_time time,
  reason text,
  is_active boolean default true,
  created_at timestamp default now(),
  constraint availability_blocks_time_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and start_time < end_time)
  )
);

create table if not exists public.appointment_reservations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  availability_rule_id uuid references public.doctor_availability_rules(id) on delete set null,
  title text,
  appointment_type text not null,
  city text not null,
  location text,
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  status text default 'Pendiente',
  source text default 'patient',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  constraint appointment_reservations_status_check check (status in ('Pendiente', 'Confirmada', 'Realizada', 'Cancelada', 'Rechazada')),
  constraint appointment_reservations_time_check check (start_time < end_time)
);

create index if not exists doctor_availability_rules_lookup_idx
on public.doctor_availability_rules (city, appointment_type, is_active, availability_type, day_of_week, specific_date);

create index if not exists availability_blocks_lookup_idx
on public.availability_blocks (block_date, city, is_active);

create index if not exists appointment_reservations_slot_idx
on public.appointment_reservations (appointment_date, city, appointment_type, start_time, end_time, status);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_doctor_availability_rules on public.doctor_availability_rules;
create trigger touch_doctor_availability_rules
before update on public.doctor_availability_rules
for each row execute procedure public.touch_updated_at();

drop trigger if exists touch_appointment_reservations on public.appointment_reservations;
create trigger touch_appointment_reservations
before update on public.appointment_reservations
for each row execute procedure public.touch_updated_at();

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
    and ar.status in ('Pendiente', 'Confirmada', 'Realizada');

  if taken_count >= rule_row.capacity_per_slot then
    raise exception 'Este horario ya no esta disponible.';
  end if;

  insert into public.appointment_reservations (
    patient_id,
    user_id,
    availability_rule_id,
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

alter table public.doctor_availability_rules enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.appointment_reservations enable row level security;

drop policy if exists "Visitors read active availability rules" on public.doctor_availability_rules;
create policy "Visitors read active availability rules" on public.doctor_availability_rules
for select using (is_active = true or public.is_staff());

drop policy if exists "Staff manage availability rules" on public.doctor_availability_rules;
create policy "Staff manage availability rules" on public.doctor_availability_rules
for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage availability blocks" on public.availability_blocks;
create policy "Staff manage availability blocks" on public.availability_blocks
for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Users read own appointment reservations" on public.appointment_reservations;
create policy "Users read own appointment reservations" on public.appointment_reservations
for select using (auth.uid() = user_id or public.is_staff());

drop policy if exists "Users create own appointment reservations" on public.appointment_reservations;
create policy "Users create own appointment reservations" on public.appointment_reservations
for insert with check (auth.uid() = user_id or public.is_staff());

drop policy if exists "Users cancel own appointment reservations" on public.appointment_reservations;
create policy "Users cancel own appointment reservations" on public.appointment_reservations
for update using ((auth.uid() = user_id and status in ('Pendiente', 'Confirmada')) or public.is_staff())
with check ((auth.uid() = user_id and status = 'Cancelada') or public.is_staff());

drop policy if exists "Staff manage appointment reservations" on public.appointment_reservations;
create policy "Staff manage appointment reservations" on public.appointment_reservations
for all using (public.is_staff()) with check (public.is_staff());

insert into storage.buckets (id, name, public)
values
  ('patient-photos-private', 'patient-photos-private', false),
  ('medical-files-private', 'medical-files-private', false),
  ('book-files-private', 'book-files-private', false),
  ('book-covers-public', 'book-covers-public', true),
  ('payment-receipts-private', 'payment-receipts-private', false),
  ('public-gallery', 'public-gallery', true)
on conflict (id) do nothing;

drop policy if exists "Public read public media buckets" on storage.objects;
create policy "Public read public media buckets" on storage.objects
for select using (bucket_id in ('book-covers-public', 'public-gallery'));

drop policy if exists "Staff manage clinical private storage" on storage.objects;
create policy "Staff manage clinical private storage" on storage.objects
for all using (bucket_id in ('patient-photos-private', 'medical-files-private') and public.is_staff())
with check (bucket_id in ('patient-photos-private', 'medical-files-private') and public.is_staff());

drop policy if exists "Patients read visible clinical photos storage" on storage.objects;
create policy "Patients read visible clinical photos storage" on storage.objects
for select using (
  bucket_id = 'patient-photos-private'
  and exists (
    select 1
    from public.patient_photos pp
    join public.patients p on p.id = pp.patient_id
    where pp.image_path = storage.objects.name
      and pp.is_visible_to_patient = true
      and p.profile_id = auth.uid()
  )
);

drop policy if exists "Staff manage book files storage" on storage.objects;
create policy "Staff manage book files storage" on storage.objects
for all using (bucket_id = 'book-files-private' and public.is_staff())
with check (bucket_id = 'book-files-private' and public.is_staff());

drop policy if exists "Token owners read private book files storage" on storage.objects;
create policy "Token owners read private book files storage" on storage.objects
for select using (
  bucket_id = 'book-files-private'
  and exists (
    select 1
    from public.book_download_tokens t
    join public.books b on b.id = t.book_id
    where b.file_path = storage.objects.name
      and t.user_id = auth.uid()
      and t.is_active = true
      and t.used_count < t.max_uses
      and (t.expires_at is null or t.expires_at > now())
  )
);

drop policy if exists "Staff manage public media storage" on storage.objects;
create policy "Staff manage public media storage" on storage.objects
for all using (bucket_id in ('book-covers-public', 'public-gallery') and public.is_staff())
with check (bucket_id in ('book-covers-public', 'public-gallery') and public.is_staff());

drop policy if exists "Authenticated upload payment receipts" on storage.objects;
create policy "Authenticated upload payment receipts" on storage.objects
for insert with check (bucket_id = 'payment-receipts-private' and auth.uid() is not null);

drop policy if exists "Receipt owners and staff read payment receipts" on storage.objects;
create policy "Receipt owners and staff read payment receipts" on storage.objects
for select using (bucket_id = 'payment-receipts-private' and (auth.uid() is not null or public.is_staff()));
