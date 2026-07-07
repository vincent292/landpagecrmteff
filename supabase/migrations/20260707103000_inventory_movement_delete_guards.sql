create or replace function public.guard_inventory_movement_deletion_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.is_deleted is distinct from old.is_deleted
    or new.deleted_at is distinct from old.deleted_at
    or new.deleted_by is distinct from old.deleted_by
    or new.deleted_by_role is distinct from old.deleted_by_role
    or new.deleted_by_name is distinct from old.deleted_by_name
    or new.deleted_by_email is distinct from old.deleted_by_email
  ) and coalesce(current_setting('app.inventory_movement_deletion_update', true), '') <> 'on' then
    raise exception 'Usa las acciones de borrar/restaurar movimiento para ajustar stock y auditoria.';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_movements_guard_deletion_update on public.inventory_movements;
create trigger inventory_movements_guard_deletion_update
before update on public.inventory_movements
for each row execute function public.guard_inventory_movement_deletion_update();

drop trigger if exists audit_soft_delete_inventory_movements on public.inventory_movements;
create trigger audit_soft_delete_inventory_movements
after update on public.inventory_movements
for each row execute procedure public.audit_soft_delete();

create or replace function public.guard_inventory_movement_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
begin
  if auth.uid() is null or not public.is_superadmin() then
    raise exception 'Solo el superusuario puede eliminar movimientos de inventario de forma permanente.'
      using errcode = '42501';
  end if;

  if coalesce(current_setting('app.inventory_movement_hard_delete', true), '') <> 'on' then
    raise exception 'Usa la accion de borrado definitivo del movimiento para ajustar stock y auditoria.';
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
    tg_table_name,
    old.id,
    'hard_delete',
    actor.actor_profile_id,
    actor.actor_role,
    actor.actor_name,
    actor.actor_email,
    to_jsonb(old)
  );

  return old;
end;
$$;

drop trigger if exists inventory_movements_guard_hard_delete on public.inventory_movements;
create trigger inventory_movements_guard_hard_delete
before delete on public.inventory_movements
for each row execute function public.guard_inventory_movement_hard_delete();

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
  perform set_config('app.inventory_movement_deletion_update', 'on', true);

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
  perform set_config('app.inventory_movement_deletion_update', 'on', true);

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

  update public.clinical_inventory_usages
  set inventory_movement_id = null,
      is_deleted = true,
      deleted_at = coalesce(deleted_at, now()),
      deleted_by = coalesce(deleted_by, actor.actor_profile_id),
      deleted_by_role = coalesce(deleted_by_role, actor.actor_role),
      deleted_by_name = coalesce(deleted_by_name, actor.actor_name),
      deleted_by_email = coalesce(deleted_by_email, actor.actor_email)
  where inventory_movement_id = movement_row.id;

  perform set_config('app.inventory_movement_hard_delete', 'on', true);

  delete from public.inventory_movements
  where id = movement_row.id;
end;
$$;

notify pgrst, 'reload schema';
