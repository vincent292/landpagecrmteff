alter table public.inventory_counts
  add column if not exists shift_name text,
  add column if not exists opened_by uuid references public.profiles(id) on delete set null,
  add column if not exists opened_at timestamptz;

update public.inventory_counts
set opened_by = coalesce(opened_by, created_by),
    opened_at = coalesce(opened_at, created_at)
where opened_at is null
   or opened_by is null;

alter table public.inventory_counts
  alter column opened_at set default now();

alter table public.inventory_count_lines
  add column if not exists opening_stock numeric(12,2) not null default 0,
  add column if not exists counted_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.inventory_count_lines
set opening_stock = expected_stock
where opening_stock = 0
  and expected_stock <> 0;

create unique index if not exists inventory_counts_one_open_shift_per_location_idx
on public.inventory_counts (coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
where status = 'abierto' and is_deleted = false;

create unique index if not exists inventory_count_lines_count_item_unique_idx
on public.inventory_count_lines (count_id, item_id);

drop trigger if exists inventory_count_lines_touch_updated_at on public.inventory_count_lines;
create trigger inventory_count_lines_touch_updated_at
before update on public.inventory_count_lines
for each row execute function public.set_row_updated_at();

create or replace function public.open_inventory_shift(
  p_location_id uuid default null,
  p_shift_name text default null,
  p_notes text default null,
  p_count_date date default current_date
)
returns public.inventory_counts
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_shift public.inventory_counts%rowtype;
  inserted_shift public.inventory_counts%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede abrir turnos de inventario.';
  end if;

  select *
  into existing_shift
  from public.inventory_counts
  where status = 'abierto'
    and is_deleted = false
    and location_id is not distinct from p_location_id
  for update;

  if found then
    raise exception 'Ya existe un turno de inventario abierto para esta ubicacion.';
  end if;

  insert into public.inventory_counts (
    count_date,
    location_id,
    status,
    shift_name,
    notes,
    created_by,
    opened_by,
    opened_at
  )
  values (
    coalesce(p_count_date, current_date),
    p_location_id,
    'abierto',
    nullif(trim(coalesce(p_shift_name, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    auth.uid(),
    now()
  )
  returning *
  into inserted_shift;

  insert into public.inventory_count_lines (
    count_id,
    item_id,
    opening_stock,
    expected_stock,
    counted_stock,
    difference_stock
  )
  select
    inserted_shift.id,
    item.id,
    item.current_stock,
    item.current_stock,
    item.current_stock,
    0
  from public.inventory_items item
  where item.is_deleted = false
    and item.is_active = true
    and (p_location_id is null or item.location_id = p_location_id)
  order by item.name;

  return inserted_shift;
end;
$$;

create or replace function public.update_inventory_shift_line(
  p_count_id uuid,
  p_item_id uuid,
  p_counted_stock numeric,
  p_notes text default null
)
returns public.inventory_count_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  current_shift public.inventory_counts%rowtype;
  current_item public.inventory_items%rowtype;
  updated_line public.inventory_count_lines%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede registrar conteos de turno.';
  end if;

  if p_counted_stock is null or p_counted_stock < 0 then
    raise exception 'El conteo no puede ser negativo.';
  end if;

  select *
  into current_shift
  from public.inventory_counts
  where id = p_count_id
    and status = 'abierto'
    and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos un turno abierto para este conteo.';
  end if;

  select *
  into current_item
  from public.inventory_items
  where id = p_item_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos el item de inventario.';
  end if;

  if current_shift.location_id is not null and current_item.location_id is distinct from current_shift.location_id then
    raise exception 'Este item no pertenece a la ubicacion del turno.';
  end if;

  insert into public.inventory_count_lines (
    count_id,
    item_id,
    opening_stock,
    expected_stock,
    counted_stock,
    difference_stock,
    notes,
    counted_by,
    updated_at
  )
  values (
    current_shift.id,
    current_item.id,
    current_item.current_stock,
    current_item.current_stock,
    p_counted_stock,
    p_counted_stock - current_item.current_stock,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    now()
  )
  on conflict (count_id, item_id)
  do update set
    counted_stock = excluded.counted_stock,
    difference_stock = excluded.counted_stock - inventory_count_lines.expected_stock,
    notes = excluded.notes,
    counted_by = excluded.counted_by,
    updated_at = now()
  returning *
  into updated_line;

  return updated_line;
end;
$$;

create or replace function public.close_inventory_shift(
  p_count_id uuid,
  p_notes text default null
)
returns public.inventory_counts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_shift public.inventory_counts%rowtype;
  current_item public.inventory_items%rowtype;
  line_row public.inventory_count_lines%rowtype;
  current_location public.inventory_locations%rowtype;
  final_difference numeric(12,2);
  updated_shift public.inventory_counts%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede cerrar turnos de inventario.';
  end if;

  select *
  into current_shift
  from public.inventory_counts
  where id = p_count_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos el turno de inventario.';
  end if;

  if current_shift.status = 'cerrado' then
    return current_shift;
  end if;

  if current_shift.location_id is not null then
    select *
    into current_location
    from public.inventory_locations
    where id = current_shift.location_id;
  end if;

  for line_row in
    select *
    from public.inventory_count_lines
    where count_id = current_shift.id
    order by created_at
  loop
    select *
    into current_item
    from public.inventory_items
    where id = line_row.item_id
      and is_deleted = false
    for update;

    if found then
      final_difference := line_row.counted_stock - current_item.current_stock;

      update public.inventory_count_lines
      set expected_stock = current_item.current_stock,
          difference_stock = final_difference,
          counted_by = coalesce(counted_by, auth.uid()),
          updated_at = now()
      where id = line_row.id;

      if final_difference <> 0 then
        insert into public.inventory_adjustments (
          item_id,
          item_name_snapshot,
          category_snapshot,
          location_name_snapshot,
          adjustment_type,
          previous_stock,
          new_stock,
          difference_stock,
          reason,
          counted_at,
          created_by
        )
        values (
          current_item.id,
          current_item.name,
          current_item.category,
          current_location.name,
          'conteo_nocturno',
          current_item.current_stock,
          line_row.counted_stock,
          final_difference,
          concat_ws(' - ', 'Cierre de turno', nullif(trim(coalesce(current_shift.shift_name, '')), ''), nullif(trim(coalesce(p_notes, current_shift.notes, '')), '')),
          now(),
          auth.uid()
        );

        insert into public.inventory_movements (
          item_id,
          movement_type,
          quantity,
          to_location_id,
          reference,
          reason,
          movement_date,
          item_name_snapshot,
          to_location_snapshot,
          created_by
        )
        values (
          current_item.id,
          'conteo',
          abs(final_difference),
          current_shift.location_id,
          current_shift.id::text,
          concat_ws(' - ', 'Diferencia en cierre de turno', nullif(trim(coalesce(current_shift.shift_name, '')), '')),
          now(),
          current_item.name,
          current_location.name,
          auth.uid()
        );
      end if;

      update public.inventory_items
      set current_stock = line_row.counted_stock,
          location_id = coalesce(current_shift.location_id, location_id),
          updated_by = auth.uid(),
          updated_at = now()
      where id = current_item.id;
    end if;
  end loop;

  update public.inventory_counts
  set status = 'cerrado',
      notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
      closed_by = auth.uid(),
      closed_at = now(),
      updated_at = now()
  where id = current_shift.id
  returning *
  into updated_shift;

  return updated_shift;
end;
$$;

drop policy if exists "Staff manage doctor profiles" on public.doctor_profiles;
drop policy if exists "Admin manage doctor profiles" on public.doctor_profiles;
create policy "Admin manage doctor profiles"
on public.doctor_profiles
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

create or replace function public.update_my_doctor_profile(
  p_full_name text default null,
  p_specialty text default null,
  p_bio text default null,
  p_city text default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_email text default null,
  p_instagram_url text default null,
  p_tiktok_url text default null,
  p_photo_url text default null
)
returns public.doctor_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  doctor_id uuid;
  updated_doctor public.doctor_profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  doctor_id := public.current_doctor_profile_id();

  if doctor_id is null then
    raise exception 'No encontramos un perfil medico vinculado a tu cuenta.';
  end if;

  update public.doctor_profiles
  set full_name = coalesce(nullif(trim(coalesce(p_full_name, '')), ''), full_name),
      specialty = nullif(trim(coalesce(p_specialty, '')), ''),
      bio = nullif(trim(coalesce(p_bio, '')), ''),
      city = nullif(trim(coalesce(p_city, '')), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      whatsapp = nullif(trim(coalesce(p_whatsapp, '')), ''),
      email = nullif(trim(coalesce(p_email, '')), ''),
      instagram_url = nullif(trim(coalesce(p_instagram_url, '')), ''),
      tiktok_url = nullif(trim(coalesce(p_tiktok_url, '')), ''),
      photo_url = nullif(trim(coalesce(p_photo_url, '')), ''),
      updated_at = now()
  where id = doctor_id
  returning *
  into updated_doctor;

  update public.profiles
  set full_name = updated_doctor.full_name,
      phone = updated_doctor.phone,
      city = updated_doctor.city
  where id = auth.uid();

  return updated_doctor;
end;
$$;

grant execute on function public.open_inventory_shift(uuid, text, text, date) to authenticated;
grant execute on function public.update_inventory_shift_line(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.close_inventory_shift(uuid, text) to authenticated;
grant execute on function public.update_my_doctor_profile(text, text, text, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
