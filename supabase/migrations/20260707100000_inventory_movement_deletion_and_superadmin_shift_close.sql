create or replace function public.inventory_movement_stock_delta(
  p_movement_type text,
  p_quantity numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_movement_type in ('entrada', 'ajuste') then coalesce(p_quantity, 0)
    when p_movement_type in ('salida', 'merma') then -coalesce(p_quantity, 0)
    else 0
  end;
$$;

alter table public.clinical_inventory_usages
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists deleted_by_role text,
  add column if not exists deleted_by_name text,
  add column if not exists deleted_by_email text;

create or replace function public.apply_inventory_movement_stock_effect(
  p_movement public.inventory_movements,
  p_direction integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_delta numeric(12,2);
begin
  if p_movement.id is null then
    raise exception 'Movimiento de inventario no valido.';
  end if;

  if p_direction not in (-1, 1) then
    raise exception 'Direccion de ajuste de inventario no valida.';
  end if;

  stock_delta := public.inventory_movement_stock_delta(p_movement.movement_type, p_movement.quantity) * p_direction;

  if stock_delta <> 0 then
    update public.inventory_items
    set current_stock = current_stock + stock_delta,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_movement.item_id
      and is_deleted = false
      and current_stock + stock_delta >= 0;

    if not found then
      raise exception 'No se pudo ajustar el stock del item. Revisa que no quede negativo o que el item exista.';
    end if;
  end if;

  if p_movement.lot_id is not null and p_movement.movement_type in ('entrada', 'salida', 'merma') then
    stock_delta := case
      when p_movement.movement_type = 'entrada' then p_movement.quantity * p_direction
      when p_movement.movement_type in ('salida', 'merma') then -p_movement.quantity * p_direction
      else 0
    end;

    update public.inventory_lots
    set current_quantity = current_quantity + stock_delta,
        initial_quantity = case
          when p_movement.movement_type = 'entrada' then initial_quantity + stock_delta
          else initial_quantity
        end,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_movement.lot_id
      and current_quantity + stock_delta >= 0
      and (
        p_movement.movement_type <> 'entrada'
        or initial_quantity + stock_delta >= 0
      );

    if not found then
      raise exception 'No se pudo ajustar el lote. Revisa que no quede negativo o que el lote exista.';
    end if;
  end if;
end;
$$;

create or replace function public.soft_delete_inventory_movement(
  p_movement_id uuid
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  movement_row public.inventory_movements%rowtype;
  actor record;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede borrar movimientos de inventario.';
  end if;

  select * into movement_row
  from public.inventory_movements
  where id = p_movement_id
  for update;

  if not found then
    raise exception 'No encontramos el movimiento de inventario.';
  end if;

  if movement_row.is_deleted then
    return movement_row;
  end if;

  perform public.apply_inventory_movement_stock_effect(movement_row, -1);
  select * into actor from public.capture_delete_actor();

  update public.inventory_movements
  set is_deleted = true,
      deleted_at = now(),
      deleted_by = actor.actor_profile_id,
      deleted_by_role = actor.actor_role,
      deleted_by_name = actor.actor_name,
      deleted_by_email = actor.actor_email
  where id = movement_row.id
  returning * into movement_row;

  update public.clinical_inventory_usages
  set is_deleted = true,
      deleted_at = now(),
      deleted_by = actor.actor_profile_id,
      deleted_by_role = actor.actor_role,
      deleted_by_name = actor.actor_name,
      deleted_by_email = actor.actor_email
  where inventory_movement_id = movement_row.id
    and is_deleted = false;

  return movement_row;
end;
$$;

create or replace function public.restore_inventory_movement(
  p_movement_id uuid
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  movement_row public.inventory_movements%rowtype;
  movement_deleted_at timestamptz;
  movement_deleted_by uuid;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'Solo Administrador/a o Superusuario puede restaurar movimientos de inventario.';
  end if;

  select * into movement_row
  from public.inventory_movements
  where id = p_movement_id
  for update;

  if not found then
    raise exception 'No encontramos el movimiento de inventario.';
  end if;

  if not movement_row.is_deleted then
    return movement_row;
  end if;

  movement_deleted_at := movement_row.deleted_at;
  movement_deleted_by := movement_row.deleted_by;

  perform public.apply_inventory_movement_stock_effect(movement_row, 1);

  update public.inventory_movements
  set is_deleted = false,
      deleted_at = null,
      deleted_by = null,
      deleted_by_role = null,
      deleted_by_name = null,
      deleted_by_email = null
  where id = movement_row.id
  returning * into movement_row;

  update public.clinical_inventory_usages
  set is_deleted = false,
      deleted_at = null,
      deleted_by = null,
      deleted_by_role = null,
      deleted_by_name = null,
      deleted_by_email = null
  where inventory_movement_id = movement_row.id
    and is_deleted = true
    and deleted_by is not distinct from movement_deleted_by
    and movement_deleted_at is not null
    and deleted_at between movement_deleted_at - interval '5 seconds' and movement_deleted_at + interval '5 seconds';

  return movement_row;
end;
$$;

create or replace function public.hard_delete_inventory_movement(
  p_movement_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  movement_row public.inventory_movements%rowtype;
  actor record;
begin
  if auth.uid() is null or not public.is_superadmin() then
    raise exception 'Solo el superusuario puede eliminar movimientos de inventario de forma permanente.'
      using errcode = '42501';
  end if;

  select * into movement_row
  from public.inventory_movements
  where id = p_movement_id
  for update;

  if not found then
    return;
  end if;

  if not movement_row.is_deleted then
    perform public.apply_inventory_movement_stock_effect(movement_row, -1);
  end if;

  select * into actor from public.capture_delete_actor();

  insert into public.admin_deletion_audit (
    table_name,
    record_id,
    action,
    actor_profile_id,
    actor_role,
    actor_name,
    actor_email,
    record_snapshot
  )
  values (
    'inventory_movements',
    movement_row.id,
    'hard_delete',
    actor.actor_profile_id,
    actor.actor_role,
    actor.actor_name,
    actor.actor_email,
    to_jsonb(movement_row)
  );

  update public.clinical_inventory_usages
  set inventory_movement_id = null,
      is_deleted = true,
      deleted_at = coalesce(deleted_at, now()),
      deleted_by = coalesce(deleted_by, actor.actor_profile_id),
      deleted_by_role = coalesce(deleted_by_role, actor.actor_role),
      deleted_by_name = coalesce(deleted_by_name, actor.actor_name),
      deleted_by_email = coalesce(deleted_by_email, actor.actor_email)
  where inventory_movement_id = movement_row.id;

  delete from public.inventory_movements
  where id = movement_row.id;
end;
$$;

create or replace function public.enforce_inventory_count_closure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  opener_id uuid;
begin
  if new.created_by is distinct from old.created_by
    or new.opened_by is distinct from old.opened_by
    or new.opened_at is distinct from old.opened_at then
    raise exception 'La auditoria de apertura del turno de inventario no puede modificarse.';
  end if;

  if old.status = 'cerrado' then
    if new.status is distinct from old.status
      or new.closed_by is distinct from old.closed_by
      or new.closed_at is distinct from old.closed_at then
      raise exception 'El turno de inventario ya esta cerrado y su auditoria no puede modificarse.';
    end if;

    return new;
  end if;

  if new.status = 'cerrado' then
    opener_id := coalesce(old.opened_by, old.created_by);

    if auth.uid() is null or (opener_id is distinct from auth.uid() and not public.is_superadmin()) then
      raise exception 'Solo la responsable que abrio este turno o Superusuario puede cerrarlo.';
    end if;

    new.closed_by := auth.uid();
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_by := null;
    new.closed_at := null;
  end if;

  return new;
end;
$$;

grant execute on function public.soft_delete_inventory_movement(uuid) to authenticated;
grant execute on function public.restore_inventory_movement(uuid) to authenticated;
grant execute on function public.hard_delete_inventory_movement(uuid) to authenticated;

notify pgrst, 'reload schema';
