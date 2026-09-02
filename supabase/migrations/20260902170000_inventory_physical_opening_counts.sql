alter table public.inventory_counts
  add column if not exists opening_count_completed_at timestamptz,
  add column if not exists opening_count_completed_by uuid references public.profiles(id) on delete set null;

alter table public.inventory_count_lines
  add column if not exists opening_counted_stock numeric(12,2),
  add column if not exists opening_difference_stock numeric(12,2) not null default 0,
  add column if not exists opening_notes text,
  add column if not exists opening_counted_by uuid references public.profiles(id) on delete set null,
  add column if not exists opening_counted_at timestamptz,
  add column if not exists opening_full_presentations numeric(12,2),
  add column if not exists opening_loose_units numeric(12,2),
  add column if not exists closing_full_presentations numeric(12,2),
  add column if not exists closing_loose_units numeric(12,2),
  add column if not exists presentation_unit_id_snapshot uuid references public.inventory_units(id) on delete set null,
  add column if not exists presentation_label_snapshot text,
  add column if not exists units_per_presentation_snapshot numeric(12,2) not null default 1;

update public.inventory_counts
set opening_count_completed_at = coalesce(opening_count_completed_at, opened_at, created_at),
    opening_count_completed_by = coalesce(opening_count_completed_by, opened_by, created_by)
where opening_count_completed_at is null;

update public.inventory_count_lines line
set opening_counted_stock = coalesce(line.opening_counted_stock, line.opening_stock),
    opening_difference_stock = coalesce(line.opening_counted_stock, line.opening_stock) - line.opening_stock,
    opening_counted_by = coalesce(line.opening_counted_by, line.counted_by),
    opening_counted_at = coalesce(line.opening_counted_at, line.created_at),
    presentation_unit_id_snapshot = coalesce(line.presentation_unit_id_snapshot, item.presentation_unit_id),
    presentation_label_snapshot = coalesce(line.presentation_label_snapshot, presentation.abbreviation),
    units_per_presentation_snapshot = greatest(coalesce(item.units_per_presentation, 1), 0.01)
from public.inventory_items item
left join public.inventory_units presentation on presentation.id = item.presentation_unit_id
where item.id = line.item_id;

insert into public.inventory_units (name, abbreviation, unit_type, is_base_unit, conversion_factor)
select 'Frasco', 'frasco', 'empaque', false, 1
where not exists (
  select 1 from public.inventory_units where lower(trim(name)) = 'frasco' and is_deleted = false
);

create or replace function public.guard_inventory_shift_opening_before_close()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'abierto' and new.status = 'cerrado' and new.opening_count_completed_at is null then
    raise exception 'Primero confirma el conteo fisico de apertura.';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_counts_require_opening_before_close on public.inventory_counts;
create trigger inventory_counts_require_opening_before_close
before update of status on public.inventory_counts
for each row execute function public.guard_inventory_shift_opening_before_close();

create or replace function public.guard_inventory_movements_during_opening()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.movement_type in ('entrada', 'salida', 'merma', 'transferencia', 'ajuste')
    and exists (
      select 1
      from public.inventory_counts count
      join public.inventory_items item on item.id = new.item_id
      where count.status = 'abierto'
        and count.is_deleted = false
        and count.opening_count_completed_at is null
        and (count.location_id is null or item.location_id is not distinct from count.location_id)
    ) then
    raise exception 'Primero confirma el conteo fisico de apertura.';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_movements_require_opening_count on public.inventory_movements;
create trigger inventory_movements_require_opening_count
before insert on public.inventory_movements
for each row execute function public.guard_inventory_movements_during_opening();

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

  select * into existing_shift
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
    count_date, location_id, status, shift_name, notes, created_by, opened_by, opened_at,
    opening_count_completed_at, opening_count_completed_by
  ) values (
    coalesce(p_count_date, current_date), p_location_id, 'abierto',
    nullif(trim(coalesce(p_shift_name, '')), ''), nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(), auth.uid(), now(), null, null
  ) returning * into inserted_shift;

  insert into public.inventory_count_lines (
    count_id, item_id, opening_stock, expected_stock, counted_stock, difference_stock,
    opening_counted_stock, opening_difference_stock,
    presentation_unit_id_snapshot, presentation_label_snapshot, units_per_presentation_snapshot
  )
  select
    inserted_shift.id, item.id, item.current_stock, item.current_stock, 0, 0,
    null, 0, item.presentation_unit_id, presentation.abbreviation,
    greatest(coalesce(item.units_per_presentation, 1), 0.01)
  from public.inventory_items item
  left join public.inventory_units presentation on presentation.id = item.presentation_unit_id
  where item.is_deleted = false
    and item.is_active = true
    and (p_location_id is null or item.location_id = p_location_id)
  order by item.name;

  return inserted_shift;
end;
$$;

create or replace function public.update_inventory_shift_opening_line(
  p_count_id uuid,
  p_item_id uuid,
  p_counted_stock numeric,
  p_full_presentations numeric default null,
  p_loose_units numeric default null,
  p_notes text default null
)
returns public.inventory_count_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  current_shift public.inventory_counts%rowtype;
  updated_line public.inventory_count_lines%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede registrar la apertura.';
  end if;
  if p_counted_stock is null or p_counted_stock < 0
    or coalesce(p_full_presentations, 0) < 0 or coalesce(p_loose_units, 0) < 0 then
    raise exception 'El conteo no puede ser negativo.';
  end if;

  select * into current_shift from public.inventory_counts
  where id = p_count_id and status = 'abierto' and is_deleted = false
  for update;
  if not found then raise exception 'No encontramos el turno abierto.'; end if;
  if current_shift.opening_count_completed_at is not null then
    raise exception 'La apertura de este turno ya fue confirmada.';
  end if;

  update public.inventory_count_lines
  set opening_counted_stock = p_counted_stock,
      opening_difference_stock = p_counted_stock - opening_stock,
      opening_full_presentations = p_full_presentations,
      opening_loose_units = p_loose_units,
      opening_notes = nullif(trim(coalesce(p_notes, '')), ''),
      opening_counted_by = auth.uid(),
      opening_counted_at = now(),
      updated_at = now()
  where count_id = p_count_id and item_id = p_item_id
  returning * into updated_line;

  if not found then raise exception 'No encontramos el producto dentro del turno.'; end if;
  return updated_line;
end;
$$;

create or replace function public.update_inventory_shift_closing_line(
  p_count_id uuid,
  p_item_id uuid,
  p_counted_stock numeric,
  p_full_presentations numeric default null,
  p_loose_units numeric default null,
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
    raise exception 'Solo el personal autorizado puede registrar el cierre.';
  end if;
  if p_counted_stock is null or p_counted_stock < 0
    or coalesce(p_full_presentations, 0) < 0 or coalesce(p_loose_units, 0) < 0 then
    raise exception 'El conteo no puede ser negativo.';
  end if;

  select * into current_shift from public.inventory_counts
  where id = p_count_id and status = 'abierto' and is_deleted = false
    and opening_count_completed_at is not null
  for update;
  if not found then raise exception 'Primero confirma el conteo de apertura.'; end if;

  select * into current_item from public.inventory_items
  where id = p_item_id and is_deleted = false for update;
  if not found then raise exception 'No encontramos el producto.'; end if;

  update public.inventory_count_lines
  set expected_stock = current_item.current_stock,
      counted_stock = p_counted_stock,
      difference_stock = p_counted_stock - current_item.current_stock,
      closing_full_presentations = p_full_presentations,
      closing_loose_units = p_loose_units,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      counted_by = auth.uid(),
      updated_at = now()
  where count_id = p_count_id and item_id = p_item_id
  returning * into updated_line;

  if not found then raise exception 'No encontramos el producto dentro del turno.'; end if;
  return updated_line;
end;
$$;

create or replace function public.reconcile_inventory_opening_stock(
  p_item_id uuid,
  p_target_stock numeric,
  p_count_id uuid,
  p_location_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_item public.inventory_items%rowtype;
  lot_row public.inventory_lots%rowtype;
  stock_difference numeric(12,2);
  remaining numeric(12,2);
  taken numeric(12,2);
  location_name text;
begin
  select * into current_item from public.inventory_items
  where id = p_item_id and is_deleted = false for update;
  if not found then return; end if;

  stock_difference := p_target_stock - current_item.current_stock;
  if stock_difference = 0 then return; end if;
  select name into location_name from public.inventory_locations where id = p_location_id;

  insert into public.inventory_adjustments (
    item_id, item_name_snapshot, category_snapshot, location_name_snapshot,
    adjustment_type, previous_stock, new_stock, difference_stock, reason, counted_at, created_by
  ) values (
    current_item.id, current_item.name, current_item.category, location_name,
    'correccion', current_item.current_stock, p_target_stock, stock_difference,
    nullif(trim(coalesce(p_reason, '')), ''), now(), auth.uid()
  );

  remaining := abs(stock_difference);
  if stock_difference < 0 then
    for lot_row in
      select * from public.inventory_lots
      where item_id = current_item.id and is_deleted = false and is_active = true and current_quantity > 0
        and (p_location_id is null or location_id is not distinct from p_location_id or location_id is null)
      order by expiration_date asc nulls last, received_date asc nulls last, created_at asc
      for update
    loop
      exit when remaining <= 0;
      taken := least(remaining, lot_row.current_quantity);
      update public.inventory_lots set current_quantity = current_quantity - taken,
        updated_by = auth.uid(), updated_at = now() where id = lot_row.id;
      remaining := remaining - taken;
    end loop;
  else
    select * into lot_row from public.inventory_lots
    where item_id = current_item.id and is_deleted = false and is_active = true
      and (p_location_id is null or location_id is not distinct from p_location_id or location_id is null)
    order by expiration_date asc nulls last, received_date asc nulls last, created_at asc
    limit 1 for update;
    if found then
      update public.inventory_lots set current_quantity = current_quantity + remaining,
        initial_quantity = greatest(initial_quantity, current_quantity + remaining),
        updated_by = auth.uid(), updated_at = now() where id = lot_row.id;
    end if;
  end if;

  insert into public.inventory_movements (
    item_id, movement_type, quantity, from_location_id, to_location_id,
    reference, reason, movement_date, item_name_snapshot,
    from_location_snapshot, to_location_snapshot, created_by
  ) values (
    current_item.id, 'conteo', abs(stock_difference),
    case when stock_difference < 0 then p_location_id else null end,
    case when stock_difference > 0 then p_location_id else null end,
    p_count_id::text, nullif(trim(coalesce(p_reason, '')), ''), now(), current_item.name,
    case when stock_difference < 0 then location_name else null end,
    case when stock_difference > 0 then location_name else null end,
    auth.uid()
  );

  update public.inventory_items set current_stock = p_target_stock,
    location_id = coalesce(p_location_id, location_id), updated_by = auth.uid(), updated_at = now()
  where id = current_item.id;
end;
$$;

revoke all on function public.reconcile_inventory_opening_stock(uuid, numeric, uuid, uuid, text) from public;

create or replace function public.confirm_inventory_shift_opening(
  p_count_id uuid
)
returns public.inventory_counts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_shift public.inventory_counts%rowtype;
  line_row public.inventory_count_lines%rowtype;
  updated_shift public.inventory_counts%rowtype;
  missing_count integer;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede confirmar la apertura.';
  end if;

  select * into current_shift from public.inventory_counts
  where id = p_count_id and status = 'abierto' and is_deleted = false for update;
  if not found then raise exception 'No encontramos el turno abierto.'; end if;
  if current_shift.opening_count_completed_at is not null then return current_shift; end if;

  select count(*) into missing_count from public.inventory_count_lines
  where count_id = p_count_id and opening_counted_stock is null;
  if missing_count > 0 then
    raise exception 'Falta contar % producto(s) para confirmar la apertura.', missing_count;
  end if;

  for line_row in select * from public.inventory_count_lines where count_id = p_count_id order by created_at
  loop
    perform public.reconcile_inventory_opening_stock(
      line_row.item_id,
      line_row.opening_counted_stock,
      current_shift.id,
      current_shift.location_id,
      concat_ws(' - ', 'Ajuste de apertura', nullif(trim(coalesce(current_shift.shift_name, '')), ''), nullif(trim(coalesce(line_row.opening_notes, '')), ''))
    );
    update public.inventory_count_lines
    set expected_stock = opening_counted_stock,
        counted_stock = opening_counted_stock,
        difference_stock = 0,
        updated_at = now()
    where id = line_row.id;
  end loop;

  update public.inventory_counts
  set opening_count_completed_at = now(), opening_count_completed_by = auth.uid(), updated_at = now()
  where id = current_shift.id returning * into updated_shift;
  return updated_shift;
end;
$$;

grant execute on function public.open_inventory_shift(uuid, text, text, date) to authenticated;
grant execute on function public.update_inventory_shift_opening_line(uuid, uuid, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.update_inventory_shift_closing_line(uuid, uuid, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.confirm_inventory_shift_opening(uuid) to authenticated;

notify pgrst, 'reload schema';
