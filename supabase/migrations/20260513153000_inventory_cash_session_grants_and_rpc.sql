create or replace function public.apply_inventory_adjustment(
  p_item_id uuid,
  p_adjustment_type text,
  p_new_stock numeric,
  p_reason text default null,
  p_counted_at timestamptz default now()
)
returns public.inventory_adjustments
language plpgsql
security definer
set search_path = public
as $$
declare
  current_item public.inventory_items%rowtype;
  current_location public.inventory_locations%rowtype;
  inserted_row public.inventory_adjustments%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede ajustar inventario.';
  end if;

  if p_new_stock is null or p_new_stock < 0 then
    raise exception 'El nuevo stock no puede ser negativo.';
  end if;

  if p_adjustment_type not in ('conteo_nocturno', 'compra', 'merma', 'vencido', 'correccion') then
    raise exception 'Tipo de ajuste no valido.';
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

  if current_item.location_id is not null then
    select *
    into current_location
    from public.inventory_locations
    where id = current_item.location_id;
  end if;

  update public.inventory_items
  set current_stock = p_new_stock,
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
  values (
    current_item.id,
    current_item.name,
    current_item.category,
    current_location.name,
    p_adjustment_type,
    current_item.current_stock,
    p_new_stock,
    p_new_stock - current_item.current_stock,
    nullif(trim(coalesce(p_reason, '')), ''),
    coalesce(p_counted_at, now()),
    auth.uid()
  )
  returning *
  into inserted_row;

  return inserted_row;
end;
$$;

grant select, insert, update, delete on public.inventory_locations to authenticated;
grant select, insert, update, delete on public.cash_register_sessions to authenticated;
grant execute on function public.close_cash_register_session(uuid, numeric, text) to authenticated;

notify pgrst, 'reload schema';
