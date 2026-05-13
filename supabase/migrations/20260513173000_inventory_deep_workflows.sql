create or replace function public.record_inventory_movement(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_lot_id uuid default null,
  p_unit_cost numeric default null,
  p_from_location_id uuid default null,
  p_to_location_id uuid default null,
  p_supplier_id uuid default null,
  p_reference text default null,
  p_reason text default null,
  p_movement_date timestamptz default now()
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  current_item public.inventory_items%rowtype;
  current_lot public.inventory_lots%rowtype;
  from_location public.inventory_locations%rowtype;
  to_location public.inventory_locations%rowtype;
  current_supplier public.inventory_suppliers%rowtype;
  signed_quantity numeric(12,2);
  inserted_row public.inventory_movements%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede registrar movimientos.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;

  if p_movement_type not in ('entrada', 'salida', 'merma', 'transferencia', 'ajuste') then
    raise exception 'Tipo de movimiento no valido.';
  end if;

  select * into current_item
  from public.inventory_items
  where id = p_item_id and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos el item.';
  end if;

  if p_lot_id is not null then
    select * into current_lot
    from public.inventory_lots
    where id = p_lot_id and item_id = p_item_id and is_deleted = false
    for update;
  end if;

  if p_from_location_id is not null then
    select * into from_location from public.inventory_locations where id = p_from_location_id;
  end if;

  if p_to_location_id is not null then
    select * into to_location from public.inventory_locations where id = p_to_location_id;
  end if;

  if p_supplier_id is not null then
    select * into current_supplier from public.inventory_suppliers where id = p_supplier_id;
  end if;

  signed_quantity := case
    when p_movement_type = 'entrada' then p_quantity
    when p_movement_type = 'ajuste' then p_quantity
    when p_movement_type = 'transferencia' then 0
    else -p_quantity
  end;

  if current_item.current_stock + signed_quantity < 0 then
    raise exception 'El movimiento dejaria stock negativo.';
  end if;

  update public.inventory_items
  set current_stock = current_stock + signed_quantity,
      location_id = coalesce(p_to_location_id, location_id),
      supplier_id = coalesce(p_supplier_id, supplier_id),
      reference_cost = coalesce(p_unit_cost, reference_cost),
      updated_by = auth.uid(),
      updated_at = now()
  where id = current_item.id;

  if p_lot_id is not null and p_movement_type in ('salida', 'merma') then
    if current_lot.current_quantity - p_quantity < 0 then
      raise exception 'El lote quedaria con cantidad negativa.';
    end if;

    update public.inventory_lots
    set current_quantity = current_quantity - p_quantity,
        updated_by = auth.uid(),
        updated_at = now()
    where id = current_lot.id;
  elsif p_lot_id is not null and p_movement_type = 'entrada' then
    update public.inventory_lots
    set current_quantity = current_quantity + p_quantity,
        initial_quantity = initial_quantity + p_quantity,
        unit_cost = coalesce(p_unit_cost, unit_cost),
        updated_by = auth.uid(),
        updated_at = now()
    where id = current_lot.id;
  end if;

  insert into public.inventory_movements (
    item_id,
    lot_id,
    movement_type,
    quantity,
    unit_cost,
    from_location_id,
    to_location_id,
    supplier_id,
    reference,
    reason,
    movement_date,
    item_name_snapshot,
    lot_number_snapshot,
    from_location_snapshot,
    to_location_snapshot,
    supplier_name_snapshot,
    created_by
  )
  values (
    p_item_id,
    p_lot_id,
    p_movement_type,
    p_quantity,
    p_unit_cost,
    p_from_location_id,
    p_to_location_id,
    p_supplier_id,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_reason, '')), ''),
    coalesce(p_movement_date, now()),
    current_item.name,
    current_lot.lot_number,
    from_location.name,
    to_location.name,
    current_supplier.name,
    auth.uid()
  )
  returning * into inserted_row;

  return inserted_row;
end;
$$;

create or replace function public.record_inventory_count_line(
  p_item_id uuid,
  p_counted_stock numeric,
  p_location_id uuid default null,
  p_notes text default null,
  p_count_date date default current_date
)
returns public.inventory_count_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  current_item public.inventory_items%rowtype;
  current_count public.inventory_counts%rowtype;
  inserted_line public.inventory_count_lines%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede registrar conteos.';
  end if;

  if p_counted_stock is null or p_counted_stock < 0 then
    raise exception 'El conteo no puede ser negativo.';
  end if;

  select * into current_item
  from public.inventory_items
  where id = p_item_id and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos el item.';
  end if;

  insert into public.inventory_counts (count_date, location_id, status, notes, created_by, closed_by, closed_at)
  values (coalesce(p_count_date, current_date), p_location_id, 'cerrado', p_notes, auth.uid(), auth.uid(), now())
  returning * into current_count;

  insert into public.inventory_count_lines (
    count_id,
    item_id,
    expected_stock,
    counted_stock,
    difference_stock,
    notes
  )
  values (
    current_count.id,
    current_item.id,
    current_item.current_stock,
    p_counted_stock,
    p_counted_stock - current_item.current_stock,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning * into inserted_line;

  update public.inventory_items
  set current_stock = p_counted_stock,
      location_id = coalesce(p_location_id, location_id),
      updated_by = auth.uid(),
      updated_at = now()
  where id = current_item.id;

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
  select
    current_item.id,
    current_item.name,
    current_item.category,
    locations.name,
    'conteo_nocturno',
    current_item.current_stock,
    p_counted_stock,
    p_counted_stock - current_item.current_stock,
    nullif(trim(coalesce(p_notes, '')), ''),
    now(),
    auth.uid()
  from public.inventory_locations locations
  where locations.id = p_location_id
  union all
  select
    current_item.id,
    current_item.name,
    current_item.category,
    null,
    'conteo_nocturno',
    current_item.current_stock,
    p_counted_stock,
    p_counted_stock - current_item.current_stock,
    nullif(trim(coalesce(p_notes, '')), ''),
    now(),
    auth.uid()
  where p_location_id is null;

  return inserted_line;
end;
$$;

grant execute on function public.record_inventory_movement(uuid, text, numeric, uuid, numeric, uuid, uuid, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.record_inventory_count_line(uuid, numeric, uuid, text, date) to authenticated;

notify pgrst, 'reload schema';
