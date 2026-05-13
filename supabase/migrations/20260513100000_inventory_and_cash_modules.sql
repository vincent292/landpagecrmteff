create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  sku text,
  unit text not null default 'unidad',
  city text,
  current_stock numeric(12,2) not null default 0,
  minimum_stock numeric(12,2) not null default 0,
  reference_cost numeric(12,2),
  lot_number text,
  expiration_date date,
  notes text,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_role text,
  deleted_by_name text,
  deleted_by_email text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_stock_non_negative check (current_stock >= 0 and minimum_stock >= 0),
  constraint inventory_items_reference_cost_non_negative check (reference_cost is null or reference_cost >= 0)
);

create index if not exists inventory_items_category_idx on public.inventory_items(category);
create index if not exists inventory_items_city_idx on public.inventory_items(city);
create index if not exists inventory_items_low_stock_idx on public.inventory_items(current_stock, minimum_stock);
create index if not exists inventory_items_deleted_idx on public.inventory_items(is_deleted, is_active);

create trigger inventory_items_touch_updated_at
before update on public.inventory_items
for each row
execute function public.set_row_updated_at();

create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  item_name_snapshot text not null,
  category_snapshot text,
  adjustment_type text not null,
  previous_stock numeric(12,2) not null,
  new_stock numeric(12,2) not null,
  difference_stock numeric(12,2) not null,
  reason text,
  counted_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_role text,
  deleted_by_name text,
  deleted_by_email text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_adjustments_type_check check (
    adjustment_type in ('conteo_nocturno', 'compra', 'merma', 'vencido', 'correccion')
  ),
  constraint inventory_adjustments_non_negative check (previous_stock >= 0 and new_stock >= 0)
);

create index if not exists inventory_adjustments_item_idx on public.inventory_adjustments(item_id, counted_at desc);
create index if not exists inventory_adjustments_type_idx on public.inventory_adjustments(adjustment_type);
create index if not exists inventory_adjustments_deleted_idx on public.inventory_adjustments(is_deleted, counted_at desc);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null,
  amount numeric(12,2) not null,
  payment_method text not null,
  source_module text,
  concept text not null,
  reference_name text,
  city text,
  movement_date date not null default current_date,
  status text not null default 'registrado',
  notes text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_role text,
  deleted_by_name text,
  deleted_by_email text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_movements_type_check check (movement_type in ('ingreso', 'egreso')),
  constraint cash_movements_status_check check (status in ('registrado', 'confirmado', 'anulado')),
  constraint cash_movements_amount_positive check (amount > 0)
);

create index if not exists cash_movements_date_idx on public.cash_movements(movement_date desc);
create index if not exists cash_movements_type_idx on public.cash_movements(movement_type, status);
create index if not exists cash_movements_deleted_idx on public.cash_movements(is_deleted, movement_date desc);

create trigger cash_movements_touch_updated_at
before update on public.cash_movements
for each row
execute function public.set_row_updated_at();

create table if not exists public.cash_closures (
  id uuid primary key default gen_random_uuid(),
  closure_date date not null,
  expected_balance numeric(12,2) not null,
  counted_balance numeric(12,2) not null,
  difference_amount numeric(12,2) not null,
  notes text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_role text,
  deleted_by_name text,
  deleted_by_email text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cash_closures_date_idx on public.cash_closures(closure_date desc);
create index if not exists cash_closures_deleted_idx on public.cash_closures(is_deleted, closure_date desc);

create trigger cash_closures_touch_updated_at
before update on public.cash_closures
for each row
execute function public.set_row_updated_at();

alter table public.inventory_items enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.cash_movements enable row level security;
alter table public.cash_closures enable row level security;

drop policy if exists "Staff manage inventory items" on public.inventory_items;
create policy "Staff manage inventory items"
on public.inventory_items
for all
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "Staff manage inventory adjustments" on public.inventory_adjustments;
create policy "Staff manage inventory adjustments"
on public.inventory_adjustments
for all
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "Admin staff manage cash movements" on public.cash_movements;
create policy "Admin staff manage cash movements"
on public.cash_movements
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Admin staff manage cash closures" on public.cash_closures;
create policy "Admin staff manage cash closures"
on public.cash_closures
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

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

  update public.inventory_items
  set current_stock = p_new_stock,
      updated_by = auth.uid(),
      updated_at = now()
  where id = current_item.id;

  insert into public.inventory_adjustments (
    item_id,
    item_name_snapshot,
    category_snapshot,
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
