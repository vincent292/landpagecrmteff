drop index if exists public.inventory_counts_one_open_shift_per_location_idx;

create unique index if not exists inventory_counts_one_open_shift_per_responsible_location_idx
on public.inventory_counts (
  coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(opened_by, created_by)
)
where status = 'abierto'
  and is_deleted = false
  and coalesce(opened_by, created_by) is not null;

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
    and coalesce(opened_by, created_by) = auth.uid()
  for update;

  if found then
    raise exception 'Ya tienes un turno de inventario abierto para esta ubicacion.';
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

grant execute on function public.open_inventory_shift(uuid, text, text, date) to authenticated;

notify pgrst, 'reload schema';
