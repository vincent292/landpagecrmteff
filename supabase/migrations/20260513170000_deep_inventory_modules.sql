create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
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
  updated_at timestamptz not null default now()
);

create unique index if not exists inventory_categories_name_unique
on public.inventory_categories(lower(name))
where is_deleted = false;

create trigger inventory_categories_touch_updated_at
before update on public.inventory_categories
for each row execute function public.set_row_updated_at();

create table if not exists public.inventory_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbreviation text not null,
  unit_type text not null default 'unidad',
  is_base_unit boolean not null default false,
  base_unit_id uuid references public.inventory_units(id) on delete set null,
  conversion_factor numeric(14,4) not null default 1,
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
  constraint inventory_units_type_check check (unit_type in ('unidad', 'peso', 'volumen', 'empaque')),
  constraint inventory_units_conversion_positive check (conversion_factor > 0)
);

create unique index if not exists inventory_units_abbreviation_unique
on public.inventory_units(lower(abbreviation))
where is_deleted = false;

create trigger inventory_units_touch_updated_at
before update on public.inventory_units
for each row execute function public.set_row_updated_at();

create table if not exists public.inventory_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
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
  updated_at timestamptz not null default now()
);

create index if not exists inventory_suppliers_active_idx on public.inventory_suppliers(is_deleted, is_active);

create trigger inventory_suppliers_touch_updated_at
before update on public.inventory_suppliers
for each row execute function public.set_row_updated_at();

alter table public.inventory_items
  add column if not exists category_id uuid references public.inventory_categories(id) on delete set null,
  add column if not exists unit_id uuid references public.inventory_units(id) on delete set null,
  add column if not exists supplier_id uuid references public.inventory_suppliers(id) on delete set null,
  add column if not exists item_type text not null default 'insumo',
  add column if not exists barcode text,
  add column if not exists sale_price numeric(12,2),
  add column if not exists alert_days_before_expiration integer not null default 30;

create index if not exists inventory_items_category_id_idx on public.inventory_items(category_id);
create index if not exists inventory_items_unit_id_idx on public.inventory_items(unit_id);
create index if not exists inventory_items_supplier_id_idx on public.inventory_items(supplier_id);

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  lot_number text not null,
  supplier_id uuid references public.inventory_suppliers(id) on delete set null,
  location_id uuid references public.inventory_locations(id) on delete set null,
  received_date date,
  expiration_date date,
  initial_quantity numeric(12,2) not null default 0,
  current_quantity numeric(12,2) not null default 0,
  unit_cost numeric(12,2),
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
  constraint inventory_lots_quantities_non_negative check (initial_quantity >= 0 and current_quantity >= 0),
  constraint inventory_lots_unit_cost_non_negative check (unit_cost is null or unit_cost >= 0)
);

create index if not exists inventory_lots_item_idx on public.inventory_lots(item_id);
create index if not exists inventory_lots_expiration_idx on public.inventory_lots(expiration_date);
create index if not exists inventory_lots_deleted_idx on public.inventory_lots(is_deleted, is_active);

create trigger inventory_lots_touch_updated_at
before update on public.inventory_lots
for each row execute function public.set_row_updated_at();

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  lot_id uuid references public.inventory_lots(id) on delete set null,
  movement_type text not null,
  quantity numeric(12,2) not null,
  unit_cost numeric(12,2),
  from_location_id uuid references public.inventory_locations(id) on delete set null,
  to_location_id uuid references public.inventory_locations(id) on delete set null,
  supplier_id uuid references public.inventory_suppliers(id) on delete set null,
  reference text,
  reason text,
  movement_date timestamptz not null default now(),
  item_name_snapshot text not null,
  lot_number_snapshot text,
  from_location_snapshot text,
  to_location_snapshot text,
  supplier_name_snapshot text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_role text,
  deleted_by_name text,
  deleted_by_email text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_type_check check (movement_type in ('entrada', 'salida', 'merma', 'transferencia', 'ajuste', 'conteo')),
  constraint inventory_movements_quantity_positive check (quantity > 0),
  constraint inventory_movements_unit_cost_non_negative check (unit_cost is null or unit_cost >= 0)
);

create index if not exists inventory_movements_item_date_idx on public.inventory_movements(item_id, movement_date desc);
create index if not exists inventory_movements_type_idx on public.inventory_movements(movement_type);
create index if not exists inventory_movements_deleted_idx on public.inventory_movements(is_deleted, movement_date desc);

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  count_date date not null default current_date,
  location_id uuid references public.inventory_locations(id) on delete set null,
  status text not null default 'abierto',
  notes text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_role text,
  deleted_by_name text,
  deleted_by_email text,
  created_by uuid references public.profiles(id) on delete set null,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_counts_status_check check (status in ('abierto', 'cerrado'))
);

create trigger inventory_counts_touch_updated_at
before update on public.inventory_counts
for each row execute function public.set_row_updated_at();

create table if not exists public.inventory_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.inventory_counts(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  expected_stock numeric(12,2) not null default 0,
  counted_stock numeric(12,2) not null default 0,
  difference_stock numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_count_lines_count_idx on public.inventory_count_lines(count_id);
create index if not exists inventory_count_lines_item_idx on public.inventory_count_lines(item_id);

alter table public.inventory_categories enable row level security;
alter table public.inventory_units enable row level security;
alter table public.inventory_suppliers enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_lines enable row level security;

drop policy if exists "Staff manage inventory categories" on public.inventory_categories;
create policy "Staff manage inventory categories" on public.inventory_categories for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage inventory units" on public.inventory_units;
create policy "Staff manage inventory units" on public.inventory_units for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage inventory suppliers" on public.inventory_suppliers;
create policy "Staff manage inventory suppliers" on public.inventory_suppliers for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage inventory lots" on public.inventory_lots;
create policy "Staff manage inventory lots" on public.inventory_lots for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage inventory movements" on public.inventory_movements;
create policy "Staff manage inventory movements" on public.inventory_movements for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage inventory counts" on public.inventory_counts;
create policy "Staff manage inventory counts" on public.inventory_counts for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage inventory count lines" on public.inventory_count_lines;
create policy "Staff manage inventory count lines" on public.inventory_count_lines for all using (public.is_staff()) with check (public.is_staff());

insert into public.inventory_units (name, abbreviation, unit_type, is_base_unit, conversion_factor)
values
  ('Unidad', 'u', 'unidad', true, 1),
  ('Pieza', 'pz', 'unidad', false, 1),
  ('Gramo', 'g', 'peso', true, 1),
  ('Kilogramo', 'kg', 'peso', false, 1000),
  ('Mililitro', 'ml', 'volumen', true, 1),
  ('Litro', 'l', 'volumen', false, 1000),
  ('Caja', 'caja', 'empaque', false, 1),
  ('Ampolla', 'amp', 'empaque', false, 1)
on conflict do nothing;

grant select, insert, update, delete on public.inventory_categories to authenticated;
grant select, insert, update, delete on public.inventory_units to authenticated;
grant select, insert, update, delete on public.inventory_suppliers to authenticated;
grant select, insert, update, delete on public.inventory_lots to authenticated;
grant select, insert, update, delete on public.inventory_movements to authenticated;
grant select, insert, update, delete on public.inventory_counts to authenticated;
grant select, insert, update, delete on public.inventory_count_lines to authenticated;

notify pgrst, 'reload schema';
