-- Stop the previously deployed behavior before touching unit metadata.
drop trigger if exists inventory_items_sync_clinical_usage_unit_label on public.inventory_items;
drop function if exists public.sync_clinical_usage_unit_label();

alter table public.inventory_movements
  add column if not exists unit_id_snapshot uuid references public.inventory_units(id) on delete set null,
  add column if not exists unit_label_snapshot text,
  add column if not exists unit_snapshot_status text not null default 'pending';

alter table public.clinical_inventory_usages
  add column if not exists unit_id_snapshot uuid references public.inventory_units(id) on delete set null,
  add column if not exists unit_label_snapshot text,
  add column if not exists unit_snapshot_status text not null default 'pending';

alter table public.inventory_count_lines
  add column if not exists unit_id_snapshot uuid references public.inventory_units(id) on delete set null,
  add column if not exists unit_label_snapshot text,
  add column if not exists unit_snapshot_status text not null default 'pending';

alter table public.inventory_adjustments
  add column if not exists unit_id_snapshot uuid references public.inventory_units(id) on delete set null,
  add column if not exists unit_label_snapshot text,
  add column if not exists unit_snapshot_status text not null default 'pending';

create index if not exists inventory_movements_unit_snapshot_pending_idx
on public.inventory_movements(item_id, movement_date)
where unit_snapshot_status = 'pending';

create index if not exists clinical_inventory_usages_unit_snapshot_pending_idx
on public.clinical_inventory_usages(item_id, created_at)
where unit_snapshot_status = 'pending';

create index if not exists inventory_count_lines_unit_snapshot_pending_idx
on public.inventory_count_lines(item_id, created_at)
where unit_snapshot_status = 'pending';

create index if not exists inventory_adjustments_unit_snapshot_pending_idx
on public.inventory_adjustments(item_id, counted_at)
where unit_snapshot_status = 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_movements_unit_snapshot_status_check'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_unit_snapshot_status_check
      check (unit_snapshot_status in ('pending', 'confirmed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinical_inventory_usages_unit_snapshot_status_check'
  ) then
    alter table public.clinical_inventory_usages
      add constraint clinical_inventory_usages_unit_snapshot_status_check
      check (unit_snapshot_status in ('pending', 'confirmed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_count_lines_unit_snapshot_status_check'
  ) then
    alter table public.inventory_count_lines
      add constraint inventory_count_lines_unit_snapshot_status_check
      check (unit_snapshot_status in ('pending', 'confirmed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_adjustments_unit_snapshot_status_check'
  ) then
    alter table public.inventory_adjustments
      add constraint inventory_adjustments_unit_snapshot_status_check
      check (unit_snapshot_status in ('pending', 'confirmed'));
  end if;
end $$;

create or replace function public.capture_inventory_unit_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_unit_id uuid;
  item_unit_label text;
begin
  select
    items.unit_id,
    coalesce(nullif(trim(units.abbreviation), ''), nullif(trim(items.unit), ''))
  into item_unit_id, item_unit_label
  from public.inventory_items items
  left join public.inventory_units units on units.id = items.unit_id
  where items.id = new.item_id;

  new.unit_id_snapshot := coalesce(new.unit_id_snapshot, item_unit_id);
  new.unit_label_snapshot := coalesce(
    nullif(trim(new.unit_label_snapshot), ''),
    item_unit_label
  );
  new.unit_snapshot_status := case
    when new.unit_label_snapshot is null then 'pending'
    else 'confirmed'
  end;

  return new;
end;
$$;

create or replace function public.capture_clinical_inventory_usage_unit_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  movement_unit_id uuid;
  movement_unit_label text;
  movement_unit_status text;
  item_unit_id uuid;
  item_unit_label text;
begin
  if new.inventory_movement_id is not null then
    select
      movements.unit_id_snapshot,
      movements.unit_label_snapshot,
      movements.unit_snapshot_status
    into movement_unit_id, movement_unit_label, movement_unit_status
    from public.inventory_movements movements
    where movements.id = new.inventory_movement_id;
  end if;

  if movement_unit_status = 'confirmed' and movement_unit_label is not null then
    new.unit_id_snapshot := movement_unit_id;
    new.unit_label_snapshot := movement_unit_label;
  else
    select
      items.unit_id,
      coalesce(nullif(trim(units.abbreviation), ''), nullif(trim(items.unit), ''))
    into item_unit_id, item_unit_label
    from public.inventory_items items
    left join public.inventory_units units on units.id = items.unit_id
    where items.id = new.item_id;

    new.unit_id_snapshot := coalesce(new.unit_id_snapshot, item_unit_id);
    new.unit_label_snapshot := coalesce(
      nullif(trim(new.unit_label_snapshot), ''),
      item_unit_label
    );
  end if;

  new.unit_label := new.unit_label_snapshot;
  new.unit_snapshot_status := case
    when new.unit_label_snapshot is null then 'pending'
    else 'confirmed'
  end;

  return new;
end;
$$;

drop trigger if exists inventory_movements_capture_unit_snapshot on public.inventory_movements;
create trigger inventory_movements_capture_unit_snapshot
before insert on public.inventory_movements
for each row execute function public.capture_inventory_unit_snapshot();

drop trigger if exists inventory_count_lines_capture_unit_snapshot on public.inventory_count_lines;
create trigger inventory_count_lines_capture_unit_snapshot
before insert on public.inventory_count_lines
for each row execute function public.capture_inventory_unit_snapshot();

drop trigger if exists inventory_adjustments_capture_unit_snapshot on public.inventory_adjustments;
create trigger inventory_adjustments_capture_unit_snapshot
before insert on public.inventory_adjustments
for each row execute function public.capture_inventory_unit_snapshot();

drop trigger if exists clinical_inventory_usages_capture_unit_snapshot on public.clinical_inventory_usages;
create trigger clinical_inventory_usages_capture_unit_snapshot
before insert on public.clinical_inventory_usages
for each row execute function public.capture_clinical_inventory_usage_unit_snapshot();

create or replace function public.guard_inventory_unit_snapshot_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.inventory_unit_reconciliation', true), '') <> 'on'
     and (
       new.unit_id_snapshot is distinct from old.unit_id_snapshot
       or new.unit_label_snapshot is distinct from old.unit_label_snapshot
       or new.unit_snapshot_status is distinct from old.unit_snapshot_status
     ) then
    raise exception 'La unidad historica de inventario es inmutable. Usa una conciliacion controlada.';
  end if;

  return new;
end;
$$;

create or replace function public.guard_clinical_inventory_usage_unit_label_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.inventory_unit_reconciliation', true), '') <> 'on'
     and new.unit_label is distinct from old.unit_label then
    raise exception 'La unidad historica del uso clinico es inmutable. Usa una conciliacion controlada.';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_movements_guard_unit_snapshot_update on public.inventory_movements;
create trigger inventory_movements_guard_unit_snapshot_update
before update of unit_id_snapshot, unit_label_snapshot, unit_snapshot_status
on public.inventory_movements
for each row execute function public.guard_inventory_unit_snapshot_update();

drop trigger if exists inventory_count_lines_guard_unit_snapshot_update on public.inventory_count_lines;
create trigger inventory_count_lines_guard_unit_snapshot_update
before update of unit_id_snapshot, unit_label_snapshot, unit_snapshot_status
on public.inventory_count_lines
for each row execute function public.guard_inventory_unit_snapshot_update();

drop trigger if exists inventory_adjustments_guard_unit_snapshot_update on public.inventory_adjustments;
create trigger inventory_adjustments_guard_unit_snapshot_update
before update of unit_id_snapshot, unit_label_snapshot, unit_snapshot_status
on public.inventory_adjustments
for each row execute function public.guard_inventory_unit_snapshot_update();

drop trigger if exists clinical_inventory_usages_guard_unit_snapshot_update on public.clinical_inventory_usages;
create trigger clinical_inventory_usages_guard_unit_snapshot_update
before update of unit_id_snapshot, unit_label_snapshot, unit_snapshot_status
on public.clinical_inventory_usages
for each row execute function public.guard_inventory_unit_snapshot_update();

drop trigger if exists clinical_inventory_usages_guard_unit_label_update on public.clinical_inventory_usages;
create trigger clinical_inventory_usages_guard_unit_label_update
before update of unit_label on public.clinical_inventory_usages
for each row execute function public.guard_clinical_inventory_usage_unit_label_update();

create or replace function public.guard_inventory_item_stock_unit_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
       new.unit_id is distinct from old.unit_id
       or new.unit is distinct from old.unit
     )
     and coalesce(current_setting('app.inventory_unit_reconciliation', true), '') <> 'on'
     and (
       coalesce(old.current_stock, 0) <> 0
       or exists (
         select 1
         from public.inventory_movements movements
         where movements.item_id = old.id
       )
       or exists (
         select 1
         from public.clinical_inventory_usages usages
         where usages.item_id = old.id
       )
       or exists (
         select 1
         from public.inventory_count_lines count_lines
         where count_lines.item_id = old.id
       )
       or exists (
         select 1
         from public.inventory_adjustments adjustments
         where adjustments.item_id = old.id
       )
       or exists (
         select 1
         from public.inventory_lots lots
         where lots.item_id = old.id
       )
     ) then
    raise exception 'No puedes cambiar la unidad base de un item con stock o historial. Corrige sus datos mediante una conciliacion controlada.';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_items_guard_stock_unit_change on public.inventory_items;
create trigger inventory_items_guard_stock_unit_change
before update of unit_id, unit on public.inventory_items
for each row execute function public.guard_inventory_item_stock_unit_change();

create table if not exists public.inventory_unit_reconciliations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  historical_unit_id uuid not null references public.inventory_units(id) on delete restrict,
  historical_unit_label text not null,
  current_unit_id uuid references public.inventory_units(id) on delete set null,
  current_unit_label text,
  reconciled_through timestamptz not null,
  reason text not null,
  movements_reconciled integer not null default 0,
  clinical_usages_reconciled integer not null default 0,
  count_lines_reconciled integer not null default 0,
  adjustments_reconciled integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_unit_reconciliations_reason_required
    check (length(trim(reason)) >= 5)
);

create index if not exists inventory_unit_reconciliations_item_idx
on public.inventory_unit_reconciliations(item_id, created_at desc);

alter table public.inventory_unit_reconciliations enable row level security;

drop policy if exists "Admin staff read inventory unit reconciliations" on public.inventory_unit_reconciliations;
create policy "Admin staff read inventory unit reconciliations"
on public.inventory_unit_reconciliations
for select
using (public.is_admin_staff());

grant select on public.inventory_unit_reconciliations to authenticated;

create or replace function public.reconcile_inventory_item_historical_unit(
  p_item_id uuid,
  p_historical_unit_id uuid,
  p_reconciled_through timestamptz,
  p_reason text
)
returns public.inventory_unit_reconciliations
language plpgsql
security definer
set search_path = public
as $$
declare
  item_row public.inventory_items%rowtype;
  historical_unit_row public.inventory_units%rowtype;
  current_unit_label text;
  movement_count integer := 0;
  usage_count integer := 0;
  count_line_count integer := 0;
  adjustment_count integer := 0;
  reconciliation_row public.inventory_unit_reconciliations%rowtype;
begin
  if auth.uid() is null or not public.is_superadmin() then
    raise exception 'Solo Superusuario puede conciliar unidades historicas.';
  end if;

  if p_reconciled_through is null or p_reconciled_through > now() then
    raise exception 'La fecha de corte debe existir y no puede estar en el futuro.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Describe el motivo de la conciliacion.';
  end if;

  select *
  into item_row
  from public.inventory_items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'No encontramos el item de inventario.';
  end if;

  select *
  into historical_unit_row
  from public.inventory_units
  where id = p_historical_unit_id
    and is_deleted = false;

  if not found then
    raise exception 'No encontramos la unidad historica.';
  end if;

  select coalesce(nullif(trim(units.abbreviation), ''), nullif(trim(item_row.unit), ''))
  into current_unit_label
  from public.inventory_units units
  where units.id = item_row.unit_id;

  current_unit_label := coalesce(current_unit_label, nullif(trim(item_row.unit), ''));

  perform set_config('app.inventory_unit_reconciliation', 'on', true);

  update public.inventory_movements
  set
    unit_id_snapshot = historical_unit_row.id,
    unit_label_snapshot = historical_unit_row.abbreviation,
    unit_snapshot_status = 'confirmed'
  where item_id = item_row.id
    and unit_snapshot_status = 'pending'
    and movement_date <= p_reconciled_through;
  get diagnostics movement_count = row_count;

  update public.clinical_inventory_usages
  set
    unit_id_snapshot = historical_unit_row.id,
    unit_label_snapshot = historical_unit_row.abbreviation,
    unit_label = historical_unit_row.abbreviation,
    unit_snapshot_status = 'confirmed'
  where item_id = item_row.id
    and unit_snapshot_status = 'pending'
    and created_at <= p_reconciled_through;
  get diagnostics usage_count = row_count;

  update public.inventory_count_lines
  set
    unit_id_snapshot = historical_unit_row.id,
    unit_label_snapshot = historical_unit_row.abbreviation,
    unit_snapshot_status = 'confirmed'
  where item_id = item_row.id
    and unit_snapshot_status = 'pending'
    and created_at <= p_reconciled_through;
  get diagnostics count_line_count = row_count;

  update public.inventory_adjustments
  set
    unit_id_snapshot = historical_unit_row.id,
    unit_label_snapshot = historical_unit_row.abbreviation,
    unit_snapshot_status = 'confirmed'
  where item_id = item_row.id
    and unit_snapshot_status = 'pending'
    and counted_at <= p_reconciled_through;
  get diagnostics adjustment_count = row_count;

  insert into public.inventory_unit_reconciliations (
    item_id,
    historical_unit_id,
    historical_unit_label,
    current_unit_id,
    current_unit_label,
    reconciled_through,
    reason,
    movements_reconciled,
    clinical_usages_reconciled,
    count_lines_reconciled,
    adjustments_reconciled,
    created_by
  )
  values (
    item_row.id,
    historical_unit_row.id,
    historical_unit_row.abbreviation,
    item_row.unit_id,
    current_unit_label,
    p_reconciled_through,
    trim(p_reason),
    movement_count,
    usage_count,
    count_line_count,
    adjustment_count,
    auth.uid()
  )
  returning * into reconciliation_row;

  return reconciliation_row;
end;
$$;

revoke all on function public.reconcile_inventory_item_historical_unit(uuid, uuid, timestamptz, text) from public;
grant execute on function public.reconcile_inventory_item_historical_unit(uuid, uuid, timestamptz, text) to authenticated;

comment on column public.inventory_movements.unit_snapshot_status is
  'pending means the historical unit was not inferred automatically and requires explicit reconciliation.';
comment on column public.clinical_inventory_usages.unit_snapshot_status is
  'pending means the historical unit was not inferred automatically and requires explicit reconciliation.';

notify pgrst, 'reload schema';
