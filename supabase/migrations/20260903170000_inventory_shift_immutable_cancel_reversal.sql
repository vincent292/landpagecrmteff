-- Make the simplified shift workflow behave like an immutable inventory act.
-- Opening can be counted partially, but once confirmed it is sealed.
-- Cancelling an open shift archives it from normal views and reverses any
-- opening reconciliation already applied.
-- Closed/cancelled shifts are read-only history.

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
    if new is distinct from old then
      raise exception 'El turno de inventario ya esta cerrado o cancelado y solo puede consultarse.';
    end if;
    return new;
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

drop trigger if exists inventory_counts_enforce_closure on public.inventory_counts;
drop trigger if exists zz_inventory_counts_enforce_closure on public.inventory_counts;
create trigger zz_inventory_counts_enforce_closure
before update on public.inventory_counts
for each row execute function public.enforce_inventory_count_closure();

create or replace function public.guard_inventory_count_lines_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_shift public.inventory_counts%rowtype;
begin
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

drop trigger if exists inventory_count_lines_immutable_guard on public.inventory_count_lines;
drop trigger if exists zz_inventory_count_lines_immutable_guard on public.inventory_count_lines;
create trigger zz_inventory_count_lines_immutable_guard
before update or delete on public.inventory_count_lines
for each row execute function public.guard_inventory_count_lines_immutable();

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
  actor_profile public.profiles%rowtype;
  line_row public.inventory_count_lines%rowtype;
  current_item public.inventory_items%rowtype;
  target_stock numeric(12,2);
  updated_shift public.inventory_counts%rowtype;
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

  select *
  into actor_profile
  from public.profiles
  where id = auth.uid();

  if coalesce(current_shift.opened_by, current_shift.created_by) <> auth.uid()
    and coalesce(actor_profile.role, '') not in ('superadmin', 'admin') then
    raise exception 'Solo quien abrio el turno o un administrador puede cancelarlo.';
  end if;

  if current_shift.opening_count_completed_at is not null then
    for line_row in
      select *
      from public.inventory_count_lines
      where count_id = current_shift.id
        and coalesce(opening_difference_stock, 0) <> 0
      order by created_at
    loop
      select *
      into current_item
      from public.inventory_items
      where id = line_row.item_id
        and is_deleted = false
      for update;

      if found then
        target_stock := current_item.current_stock - coalesce(line_row.opening_difference_stock, 0);

        if target_stock < 0 then
          raise exception 'No se puede cancelar este turno porque el stock posterior ya depende de su apertura. Cierra/revisa los movimientos antes de cancelarlo.';
        end if;

        perform public.reconcile_inventory_opening_stock(
          line_row.item_id,
          target_stock,
          current_shift.id,
          current_shift.location_id,
          concat_ws(
            ' - ',
            'Reversion de apertura cancelada',
            nullif(trim(coalesce(current_shift.shift_name, '')), ''),
            nullif(trim(coalesce(line_row.opening_notes, '')), ''),
            nullif(trim(coalesce(p_notes, '')), '')
          )
        );
      end if;
    end loop;
  end if;

  perform set_config('app.inventory_shift_cancel', 'on', true);

  update public.inventory_counts
  set status = 'cancelado',
      is_deleted = true,
      deleted_at = now(),
      deleted_by = auth.uid(),
      deleted_by_role = actor_profile.role,
      deleted_by_name = actor_profile.full_name,
      deleted_by_email = actor_profile.email,
      notes = concat_ws(
        ' - ',
        nullif(trim(coalesce(notes, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        case
          when current_shift.opening_count_completed_at is null
            then 'Cancelado sin modificar stock'
          else 'Cancelado con reversion de apertura'
        end
      ),
      closed_by = auth.uid(),
      closed_at = now(),
      updated_at = now()
  where id = current_shift.id
  returning * into updated_shift;

  return updated_shift;
end;
$$;

create or replace function public.reopen_inventory_shift(
  p_count_id uuid,
  p_notes text default null
)
returns public.inventory_counts
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Los turnos cerrados son solo lectura y no se pueden reabrir.';
end;
$$;

grant execute on function public.cancel_inventory_shift(uuid, text) to authenticated;
grant execute on function public.reopen_inventory_shift(uuid, text) to authenticated;

notify pgrst, 'reload schema';
