alter table public.inventory_counts
  add column if not exists reopen_count integer not null default 0,
  add column if not exists last_reopened_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_reopened_at timestamptz;

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
    if coalesce(current_setting('app.inventory_shift_reopen', true), '') = 'on' then
      if auth.uid() is null or not public.is_superadmin() then
        raise exception 'Solo Superusuario puede reabrir un turno cerrado.';
      end if;

      if new.status <> 'abierto' then
        raise exception 'Un turno cerrado solo puede reabrirse a estado abierto.';
      end if;

      new.closed_by := null;
      new.closed_at := null;
      new.last_reopened_by := auth.uid();
      new.last_reopened_at := coalesce(new.last_reopened_at, now());
      new.reopen_count := coalesce(old.reopen_count, 0) + 1;
      return new;
    end if;

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

create or replace function public.reopen_inventory_shift(
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
  conflicting_shift_id uuid;
  updated_shift public.inventory_counts%rowtype;
begin
  if auth.uid() is null or not public.is_superadmin() then
    raise exception 'Solo Superusuario puede reabrir turnos de inventario.';
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

  if current_shift.status = 'abierto' then
    return current_shift;
  end if;

  select id
  into conflicting_shift_id
  from public.inventory_counts
  where id <> current_shift.id
    and status = 'abierto'
    and is_deleted = false
    and location_id is not distinct from current_shift.location_id
    and coalesce(opened_by, created_by) is not distinct from coalesce(current_shift.opened_by, current_shift.created_by)
  limit 1;

  if conflicting_shift_id is not null then
    raise exception 'La responsable ya tiene otro turno abierto para esta ubicacion. Cierra ese turno antes de reabrir este.';
  end if;

  perform set_config('app.inventory_shift_reopen', 'on', true);

  update public.inventory_counts
  set status = 'abierto',
      notes = concat_ws(
        E'\n',
        nullif(notes, ''),
        concat_ws(' - ', 'Reabierto por Superusuario', to_char(now(), 'YYYY-MM-DD HH24:MI'), nullif(trim(coalesce(p_notes, '')), ''))
      ),
      updated_at = now()
  where id = current_shift.id
  returning *
  into updated_shift;

  return updated_shift;
end;
$$;

grant execute on function public.reopen_inventory_shift(uuid, text) to authenticated;

notify pgrst, 'reload schema';
