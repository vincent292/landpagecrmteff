alter table public.clinical_histories
  add column if not exists note_type text not null default 'procedimiento',
  add column if not exists treatment_plan text,
  add column if not exists procedure_details text,
  add column if not exists pre_consultation_notes text,
  add column if not exists post_consultation_notes text,
  add column if not exists consent_notes text;

create index if not exists clinical_histories_patient_type_idx
on public.clinical_histories(patient_id, note_type, session_date desc, created_at desc);

create table if not exists public.clinical_inventory_usages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  clinical_history_id uuid references public.clinical_histories(id) on delete set null,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  lot_id uuid references public.inventory_lots(id) on delete set null,
  inventory_movement_id uuid references public.inventory_movements(id) on delete set null,
  quantity numeric(12,2) not null,
  unit_label text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint clinical_inventory_usages_quantity_positive check (quantity > 0)
);

create index if not exists clinical_inventory_usages_patient_idx
on public.clinical_inventory_usages(patient_id, created_at desc);

create index if not exists clinical_inventory_usages_history_idx
on public.clinical_inventory_usages(clinical_history_id, created_at desc);

alter table public.clinical_inventory_usages enable row level security;

drop policy if exists "Staff manage clinical inventory usages" on public.clinical_inventory_usages;
create policy "Staff manage clinical inventory usages"
on public.clinical_inventory_usages
for all
using (public.is_staff())
with check (public.is_staff());

create or replace function public.record_clinical_inventory_usage(
  p_patient_id uuid,
  p_clinical_history_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_lot_id uuid default null,
  p_unit_label text default null,
  p_notes text default null
)
returns public.clinical_inventory_usages
language plpgsql
security definer
set search_path = public
as $$
declare
  patient_row public.patients%rowtype;
  history_row public.clinical_histories%rowtype;
  item_row public.inventory_items%rowtype;
  movement_row public.inventory_movements%rowtype;
  usage_row public.clinical_inventory_usages%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'No autorizado.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad usada debe ser mayor a cero.';
  end if;

  select * into patient_row
  from public.patients
  where id = p_patient_id
  limit 1;

  if patient_row.id is null then
    raise exception 'Paciente no encontrado.';
  end if;

  if p_clinical_history_id is not null then
    select * into history_row
    from public.clinical_histories
    where id = p_clinical_history_id
      and patient_id = p_patient_id
      and coalesce(is_deleted, false) = false
    limit 1;

    if history_row.id is null then
      raise exception 'La nota clinica no corresponde al paciente.';
    end if;
  end if;

  select * into item_row
  from public.inventory_items
  where id = p_item_id
    and coalesce(is_deleted, false) = false
    and is_active = true
  limit 1;

  if item_row.id is null then
    raise exception 'Item de inventario no encontrado.';
  end if;

  select * into movement_row
  from public.record_inventory_movement(
    p_item_id,
    'salida',
    p_quantity,
    p_lot_id,
    null,
    null,
    null,
    null,
    concat('Paciente: ', patient_row.full_name),
    coalesce(nullif(trim(p_notes), ''), concat('Uso clinico en ', coalesce(history_row.session_title, 'procedimiento'))),
    now()::timestamptz
  );

  insert into public.clinical_inventory_usages (
    patient_id,
    clinical_history_id,
    item_id,
    lot_id,
    inventory_movement_id,
    quantity,
    unit_label,
    notes,
    created_by
  )
  values (
    p_patient_id,
    p_clinical_history_id,
    p_item_id,
    p_lot_id,
    movement_row.id,
    p_quantity,
    coalesce(nullif(trim(p_unit_label), ''), item_row.unit),
    p_notes,
    auth.uid()
  )
  returning * into usage_row;

  return usage_row;
end;
$$;

grant select, insert, update, delete on public.clinical_inventory_usages to authenticated;
grant execute on function public.record_clinical_inventory_usage(uuid, uuid, uuid, numeric, uuid, text, text) to authenticated;
