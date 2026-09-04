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
    or new.opened_at is distinct from old.opened_at
    or (
      old.opening_count_completed_at is not null
      and new.opening_count_completed_at is distinct from old.opening_count_completed_at
    )
    or (
      old.opening_count_completed_by is not null
      and new.opening_count_completed_by is distinct from old.opening_count_completed_by
    ) then
    raise exception 'La auditoria de apertura del turno de inventario no puede modificarse.';
  end if;

  if old.status in ('cerrado', 'cancelado') then
    if new is not distinct from old then
      return new;
    end if;

    if (
      to_jsonb(new) - array[
        'is_deleted',
        'deleted_at',
        'deleted_by',
        'deleted_by_role',
        'deleted_by_name',
        'deleted_by_email',
        'updated_at'
      ]
    ) = (
      to_jsonb(old) - array[
        'is_deleted',
        'deleted_at',
        'deleted_by',
        'deleted_by_role',
        'deleted_by_name',
        'deleted_by_email',
        'updated_at'
      ]
    ) then
      if auth.uid() is null or not public.is_staff() then
        raise exception 'Solo el personal autorizado puede archivar turnos de inventario.';
      end if;

      return new;
    end if;

    raise exception 'El turno de inventario ya esta cerrado o cancelado y solo puede consultarse.';
  end if;

  if old.is_deleted = false
    and coalesce(new.is_deleted, false) = true
    and coalesce(current_setting('app.inventory_shift_cancel', true), '') <> 'on' then
    raise exception 'Usa Cancelar turno para archivarlo y revertir la apertura de forma segura.';
  end if;

  if new.status = 'cancelado' then
    if coalesce(current_setting('app.inventory_shift_cancel', true), '') <> 'on' then
      raise exception 'Usa Cancelar turno para archivar un turno abierto.';
    end if;

    new.closed_by := coalesce(new.closed_by, auth.uid());
    new.closed_at := coalesce(new.closed_at, now());
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
    if auth.uid() is not null and public.is_superadmin() then
      return old;
    end if;

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

do $$
declare
  soft_delete_tables text[] := array[
    'inventory_items',
    'inventory_adjustments',
    'inventory_locations',
    'inventory_categories',
    'inventory_units',
    'inventory_suppliers',
    'inventory_lots',
    'inventory_counts',
    'inventory_supplier_orders',
    'clinical_inventory_usages',
    'cash_movements',
    'cash_closures',
    'cash_drawers',
    'cash_register_sessions',
    'cash_session_counts'
  ];
  hard_delete_tables text[] := array[
    'inventory_items',
    'inventory_adjustments',
    'inventory_locations',
    'inventory_categories',
    'inventory_units',
    'inventory_suppliers',
    'inventory_lots',
    'inventory_counts',
    'inventory_count_lines',
    'inventory_supplier_orders',
    'inventory_supplier_order_items',
    'inventory_supplier_order_payments',
    'clinical_inventory_usages',
    'cash_movements',
    'cash_closures',
    'cash_drawers',
    'cash_register_sessions',
    'cash_session_counts',
    'cash_session_count_lines'
  ];
  table_name text;
begin
  foreach table_name in array soft_delete_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists audit_soft_delete_%I on public.%I', table_name, table_name);
      execute format(
        'create trigger audit_soft_delete_%I after update on public.%I for each row execute procedure public.audit_soft_delete()',
        table_name,
        table_name
      );
    end if;
  end loop;

  foreach table_name in array hard_delete_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists require_superadmin_delete_%I on public.%I', table_name, table_name);
      execute format(
        'create trigger require_superadmin_delete_%I before delete on public.%I for each row execute procedure public.require_superadmin_and_audit_hard_delete()',
        table_name,
        table_name
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
