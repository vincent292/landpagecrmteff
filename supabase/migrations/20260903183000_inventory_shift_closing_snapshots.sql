-- Store closing counts as their own snapshot, independent from the opening
-- snapshot. Legacy columns (counted_stock/difference_stock/notes/counted_by)
-- remain in sync for older reports and screens.

alter table public.inventory_count_lines
  add column if not exists closing_counted_stock numeric(12,2),
  add column if not exists closing_difference_stock numeric(12,2) not null default 0,
  add column if not exists closing_notes text,
  add column if not exists closing_counted_by uuid references public.profiles(id) on delete set null,
  add column if not exists closing_counted_at timestamptz;

create or replace function public.guard_inventory_count_lines_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_shift public.inventory_counts%rowtype;
begin
  if coalesce(current_setting('app.inventory_history_backfill', true), '') = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select *
  into parent_shift
  from public.inventory_counts
  where id = case when tg_op = 'DELETE' then old.count_id else new.count_id end;

  if not found then
    raise exception 'No encontramos el turno de inventario.';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Las lineas de conteo no se eliminan; el historial del turno es solo lectura.';
  end if;

  if old.count_id is distinct from new.count_id
    or old.item_id is distinct from new.item_id
    or old.created_at is distinct from new.created_at then
    raise exception 'La estructura del conteo de inventario no puede modificarse.';
  end if;

  if parent_shift.status in ('cerrado', 'cancelado') or coalesce(parent_shift.is_deleted, false) = true then
    raise exception 'El turno ya esta cerrado o cancelado y solo puede consultarse.';
  end if;

  if parent_shift.opening_count_completed_at is not null
    and (
      old.opening_stock is distinct from new.opening_stock
      or old.opening_counted_stock is distinct from new.opening_counted_stock
      or old.opening_difference_stock is distinct from new.opening_difference_stock
      or old.opening_notes is distinct from new.opening_notes
      or old.opening_counted_by is distinct from new.opening_counted_by
      or old.opening_counted_at is distinct from new.opening_counted_at
      or old.opening_full_presentations is distinct from new.opening_full_presentations
      or old.opening_loose_units is distinct from new.opening_loose_units
      or old.presentation_unit_id_snapshot is distinct from new.presentation_unit_id_snapshot
      or old.presentation_label_snapshot is distinct from new.presentation_label_snapshot
      or old.units_per_presentation_snapshot is distinct from new.units_per_presentation_snapshot
      or old.unit_id_snapshot is distinct from new.unit_id_snapshot
      or old.unit_label_snapshot is distinct from new.unit_label_snapshot
      or old.unit_snapshot_status is distinct from new.unit_snapshot_status
    ) then
    raise exception 'El conteo de apertura ya fue confirmado y no puede modificarse.';
  end if;

  return new;
end;
$$;

select set_config('app.inventory_history_backfill', 'on', true);

update public.inventory_count_lines line
set closing_counted_stock = coalesce(line.closing_counted_stock, line.counted_stock),
    closing_difference_stock = coalesce(line.closing_difference_stock, line.difference_stock, 0),
    closing_notes = coalesce(line.closing_notes, line.notes),
    closing_counted_by = coalesce(line.closing_counted_by, line.counted_by, count.closed_by),
    closing_counted_at = coalesce(line.closing_counted_at, count.closed_at, line.updated_at)
from public.inventory_counts count
where count.id = line.count_id
  and count.status = 'cerrado'
  and line.closing_counted_stock is null;

create or replace function public.sync_inventory_count_line_closing_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_shift public.inventory_counts%rowtype;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  select *
  into parent_shift
  from public.inventory_counts
  where id = new.count_id;

  if not found then
    return new;
  end if;

  if parent_shift.status = 'abierto'
    and parent_shift.opening_count_completed_at is not null
    and (
      old.expected_stock is distinct from new.expected_stock
      or old.counted_stock is distinct from new.counted_stock
      or old.difference_stock is distinct from new.difference_stock
      or old.notes is distinct from new.notes
      or old.counted_by is distinct from new.counted_by
      or old.closing_counted_stock is distinct from new.closing_counted_stock
      or old.closing_difference_stock is distinct from new.closing_difference_stock
      or old.closing_notes is distinct from new.closing_notes
      or old.closing_counted_by is distinct from new.closing_counted_by
      or old.closing_counted_at is distinct from new.closing_counted_at
    ) then
    new.closing_counted_stock := coalesce(new.closing_counted_stock, new.counted_stock);
    new.closing_difference_stock := coalesce(new.closing_difference_stock, new.difference_stock, 0);
    new.closing_notes := coalesce(nullif(trim(coalesce(new.closing_notes, '')), ''), new.notes);
    new.closing_counted_by := coalesce(new.closing_counted_by, new.counted_by, auth.uid());
    new.closing_counted_at := coalesce(new.closing_counted_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists zy_inventory_count_lines_closing_snapshot on public.inventory_count_lines;
create trigger zy_inventory_count_lines_closing_snapshot
before update on public.inventory_count_lines
for each row execute function public.sync_inventory_count_line_closing_snapshot();

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
  closing_difference numeric(12,2);
  clean_notes text;
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

  closing_difference := p_counted_stock - current_item.current_stock;
  clean_notes := nullif(trim(coalesce(p_notes, '')), '');

  update public.inventory_count_lines
  set expected_stock = current_item.current_stock,
      counted_stock = p_counted_stock,
      difference_stock = closing_difference,
      closing_counted_stock = p_counted_stock,
      closing_difference_stock = closing_difference,
      closing_full_presentations = p_full_presentations,
      closing_loose_units = p_loose_units,
      closing_notes = clean_notes,
      notes = clean_notes,
      counted_by = auth.uid(),
      closing_counted_by = auth.uid(),
      closing_counted_at = now(),
      updated_at = now()
  where count_id = p_count_id and item_id = p_item_id
  returning * into updated_line;

  if not found then raise exception 'No encontramos el producto dentro del turno.'; end if;
  return updated_line;
end;
$$;

grant execute on function public.update_inventory_shift_closing_line(uuid, uuid, numeric, numeric, numeric, text) to authenticated;

notify pgrst, 'reload schema';
