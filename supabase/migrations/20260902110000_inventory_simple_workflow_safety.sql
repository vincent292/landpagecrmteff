-- Safety rules for the simplified inventory workflow.
-- Existing inventory history is intentionally preserved.

alter table public.inventory_counts
  drop constraint if exists inventory_counts_status_check;

alter table public.inventory_counts
  add constraint inventory_counts_status_check
  check (status in ('abierto', 'cerrado', 'cancelado'));

create or replace function public.cancel_inventory_shift(
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
  actor_role text;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede cancelar turnos de inventario.';
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

  if current_shift.status <> 'abierto' then
    raise exception 'Solo se pueden cancelar turnos abiertos.';
  end if;

  select role into actor_role from public.profiles where id = auth.uid();

  if coalesce(current_shift.opened_by, current_shift.created_by) <> auth.uid()
    and coalesce(actor_role, '') not in ('superadmin', 'admin') then
    raise exception 'Solo quien abrio el turno o un administrador puede cancelarlo.';
  end if;

  update public.inventory_counts
  set status = 'cancelado',
      notes = concat_ws(
        ' - ',
        nullif(trim(coalesce(notes, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        'Cancelado sin modificar stock'
      ),
      closed_by = auth.uid(),
      closed_at = now(),
      updated_at = now()
  where id = current_shift.id
  returning * into current_shift;

  return current_shift;
end;
$$;

grant execute on function public.cancel_inventory_shift(uuid, text) to authenticated;

-- The daily workflow uses one shared shift per inventory/location. Existing
-- parallel shifts remain visible so an administrator can cancel them safely.
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
  order by opened_at desc nulls last, created_at desc
  limit 1
  for update;

  if found then
    raise exception 'Ya existe un turno de inventario abierto. Cierralo o cancelalo antes de abrir otro.';
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
  returning * into inserted_shift;

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

grant execute on function public.open_inventory_shift(uuid, text, text, date) to authenticated;

-- Keep legacy duplicates readable, but reject new duplicate names.
create or replace function public.guard_inventory_item_duplicate_name()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_name text;
begin
  normalized_name := lower(regexp_replace(trim(new.name), '\s+', ' ', 'g'));

  if normalized_name = '' then
    raise exception 'Escribe el nombre del producto.';
  end if;

  if tg_op = 'INSERT'
    or lower(regexp_replace(trim(old.name), '\s+', ' ', 'g')) is distinct from normalized_name then
    if exists (
      select 1
      from public.inventory_items item
      where item.id <> new.id
        and item.is_deleted = false
        and lower(regexp_replace(trim(item.name), '\s+', ' ', 'g')) = normalized_name
    ) then
      raise exception 'Ya existe un producto con ese nombre.';
    end if;
  end if;

  new.name := regexp_replace(trim(new.name), '\s+', ' ', 'g');
  return new;
end;
$$;

drop trigger if exists inventory_items_guard_duplicate_name on public.inventory_items;
create trigger inventory_items_guard_duplicate_name
before insert or update of name on public.inventory_items
for each row execute function public.guard_inventory_item_duplicate_name();

notify pgrst, 'reload schema';
