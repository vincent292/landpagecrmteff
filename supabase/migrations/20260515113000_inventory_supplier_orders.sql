alter table public.inventory_suppliers
  add column if not exists whatsapp_phone text,
  add column if not exists tax_id text,
  add column if not exists payment_terms_days integer not null default 0,
  add column if not exists allows_consignment boolean not null default false;

alter table public.cash_movements
  add column if not exists attachment_path text;

create table if not exists public.inventory_supplier_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.inventory_suppliers(id) on delete restrict,
  location_id uuid references public.inventory_locations(id) on delete set null,
  status text not null default 'borrador',
  order_kind text not null default 'compra',
  payment_status text not null default 'pendiente',
  city text,
  order_number text,
  invoice_number text,
  requested_at timestamptz not null default now(),
  received_at timestamptz,
  due_date date,
  notes text,
  whatsapp_message text,
  sent_to_supplier_at timestamptz,
  document_path text,
  subtotal_amount numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  amount_pending numeric(12,2) not null default 0,
  currency_code text not null default 'BOB',
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
  constraint inventory_supplier_orders_status_check check (status in ('borrador', 'pedido', 'recibido', 'cancelado')),
  constraint inventory_supplier_orders_kind_check check (order_kind in ('compra', 'credito', 'consignacion')),
  constraint inventory_supplier_orders_payment_status_check check (payment_status in ('pendiente', 'parcial', 'pagado')),
  constraint inventory_supplier_orders_amounts_non_negative check (
    subtotal_amount >= 0
    and amount_paid >= 0
    and amount_pending >= 0
  )
);

create index if not exists inventory_supplier_orders_supplier_idx on public.inventory_supplier_orders(supplier_id, requested_at desc);
create index if not exists inventory_supplier_orders_status_idx on public.inventory_supplier_orders(status, payment_status);
create index if not exists inventory_supplier_orders_deleted_idx on public.inventory_supplier_orders(is_deleted, requested_at desc);

drop trigger if exists inventory_supplier_orders_touch_updated_at on public.inventory_supplier_orders;
create trigger inventory_supplier_orders_touch_updated_at
before update on public.inventory_supplier_orders
for each row execute function public.set_row_updated_at();

create table if not exists public.inventory_supplier_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.inventory_supplier_orders(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity_requested numeric(12,2) not null default 0,
  quantity_received numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  lot_number text,
  expiration_date date,
  notes text,
  status text not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_supplier_order_items_quantities_non_negative check (
    quantity_requested >= 0
    and quantity_received >= 0
    and unit_cost >= 0
    and line_total >= 0
  ),
  constraint inventory_supplier_order_items_status_check check (status in ('pendiente', 'recibido', 'cancelado'))
);

create index if not exists inventory_supplier_order_items_order_idx on public.inventory_supplier_order_items(order_id);
create index if not exists inventory_supplier_order_items_item_idx on public.inventory_supplier_order_items(item_id);

drop trigger if exists inventory_supplier_order_items_touch_updated_at on public.inventory_supplier_order_items;
create trigger inventory_supplier_order_items_touch_updated_at
before update on public.inventory_supplier_order_items
for each row execute function public.set_row_updated_at();

create table if not exists public.inventory_supplier_order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.inventory_supplier_orders(id) on delete cascade,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  payment_date date not null default current_date,
  amount numeric(12,2) not null,
  payment_method text not null,
  reference text,
  notes text,
  receipt_path text,
  status text not null default 'registrado',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_supplier_order_payments_amount_positive check (amount > 0),
  constraint inventory_supplier_order_payments_status_check check (status in ('registrado', 'anulado'))
);

create index if not exists inventory_supplier_order_payments_order_idx on public.inventory_supplier_order_payments(order_id, payment_date desc);
create index if not exists inventory_supplier_order_payments_cash_idx on public.inventory_supplier_order_payments(cash_movement_id);

drop trigger if exists inventory_supplier_order_payments_touch_updated_at on public.inventory_supplier_order_payments;
create trigger inventory_supplier_order_payments_touch_updated_at
before update on public.inventory_supplier_order_payments
for each row execute function public.set_row_updated_at();

create or replace function public.recalculate_inventory_supplier_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  next_subtotal numeric(12,2);
  next_paid numeric(12,2);
begin
  select coalesce(sum(line_total), 0)
  into next_subtotal
  from public.inventory_supplier_order_items
  where order_id = p_order_id;

  select coalesce(sum(amount), 0)
  into next_paid
  from public.inventory_supplier_order_payments
  where order_id = p_order_id
    and status = 'registrado';

  update public.inventory_supplier_orders
  set subtotal_amount = next_subtotal,
      amount_paid = next_paid,
      amount_pending = greatest(next_subtotal - next_paid, 0),
      payment_status = case
        when next_subtotal <= 0 then 'pendiente'
        when next_paid <= 0 then 'pendiente'
        when next_paid < next_subtotal then 'parcial'
        else 'pagado'
      end,
      updated_at = now()
  where id = p_order_id;
end;
$$;

create or replace function public.inventory_supplier_order_items_set_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.line_total := round(coalesce(new.quantity_requested, 0) * coalesce(new.unit_cost, 0), 2);
  return new;
end;
$$;

drop trigger if exists inventory_supplier_order_items_set_total on public.inventory_supplier_order_items;
create trigger inventory_supplier_order_items_set_total
before insert or update on public.inventory_supplier_order_items
for each row execute function public.inventory_supplier_order_items_set_total();

create or replace function public.inventory_supplier_order_items_sync_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_inventory_supplier_order(coalesce(new.order_id, old.order_id));
  if tg_op = 'delete' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_supplier_order_items_sync_totals on public.inventory_supplier_order_items;
create trigger inventory_supplier_order_items_sync_totals
after insert or update or delete on public.inventory_supplier_order_items
for each row execute function public.inventory_supplier_order_items_sync_totals();

create or replace function public.inventory_supplier_order_payments_sync_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'delete' then
    perform public.recalculate_inventory_supplier_order(new.order_id);
    return new;
  end if;

  perform public.recalculate_inventory_supplier_order(old.order_id);
  return old;
end;
$$;

drop trigger if exists inventory_supplier_order_payments_sync_totals on public.inventory_supplier_order_payments;
create trigger inventory_supplier_order_payments_sync_totals
after insert or update or delete on public.inventory_supplier_order_payments
for each row execute function public.inventory_supplier_order_payments_sync_totals();

create or replace function public.receive_inventory_supplier_order(
  p_order_id uuid,
  p_received_at timestamptz default now()
)
returns public.inventory_supplier_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.inventory_supplier_orders%rowtype;
  current_line public.inventory_supplier_order_items%rowtype;
  created_lot_id uuid;
  processed_rows integer := 0;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede recibir pedidos.';
  end if;

  select *
  into current_order
  from public.inventory_supplier_orders
  where id = p_order_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos el pedido al proveedor.';
  end if;

  if current_order.status = 'cancelado' then
    raise exception 'El pedido esta cancelado.';
  end if;

  for current_line in
    select *
    from public.inventory_supplier_order_items
    where order_id = current_order.id
      and status <> 'cancelado'
    order by created_at asc
  loop
    if coalesce(current_line.quantity_received, 0) <= 0 then
      continue;
    end if;

    created_lot_id := null;

    if nullif(trim(coalesce(current_line.lot_number, '')), '') is not null then
      insert into public.inventory_lots (
        item_id,
        lot_number,
        supplier_id,
        location_id,
        received_date,
        expiration_date,
        initial_quantity,
        current_quantity,
        unit_cost,
        notes,
        is_active,
        created_by,
        updated_by
      )
      values (
        current_line.item_id,
        current_line.lot_number,
        current_order.supplier_id,
        current_order.location_id,
        coalesce(p_received_at::date, current_date),
        current_line.expiration_date,
        0,
        0,
        current_line.unit_cost,
        current_line.notes,
        true,
        auth.uid(),
        auth.uid()
      )
      returning id into created_lot_id;
    end if;

    perform public.record_inventory_movement(
      current_line.item_id,
      'entrada',
      current_line.quantity_received,
      created_lot_id,
      nullif(current_line.unit_cost, 0),
      null,
      current_order.location_id,
      current_order.supplier_id,
      coalesce(nullif(trim(coalesce(current_order.invoice_number, '')), ''), nullif(trim(coalesce(current_order.order_number, '')), ''), current_order.id::text),
      coalesce(nullif(trim(coalesce(current_line.notes, '')), ''), nullif(trim(coalesce(current_order.notes, '')), ''), 'Recepcion de pedido proveedor'),
      coalesce(p_received_at, now())
    );

    update public.inventory_supplier_order_items
    set status = 'recibido',
        updated_at = now()
    where id = current_line.id;

    processed_rows := processed_rows + 1;
  end loop;

  if processed_rows = 0 then
    raise exception 'Debes indicar al menos una cantidad recibida mayor a cero.';
  end if;

  update public.inventory_supplier_orders
  set status = 'recibido',
      received_at = coalesce(p_received_at, now()),
      updated_by = auth.uid(),
      updated_at = now()
  where id = current_order.id
  returning * into current_order;

  perform public.recalculate_inventory_supplier_order(current_order.id);

  return current_order;
end;
$$;

create or replace function public.register_inventory_supplier_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date default current_date,
  p_reference text default null,
  p_notes text default null,
  p_receipt_path text default null,
  p_drawer_id uuid default null,
  p_register_session_id uuid default null,
  p_city text default null
)
returns public.inventory_supplier_order_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.inventory_supplier_orders%rowtype;
  current_supplier public.inventory_suppliers%rowtype;
  found_session_id uuid;
  found_drawer_id uuid;
  movement_id uuid;
  inserted_payment public.inventory_supplier_order_payments%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede registrar pagos a proveedores.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del pago debe ser mayor a cero.';
  end if;

  select *
  into current_order
  from public.inventory_supplier_orders
  where id = p_order_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos el pedido al proveedor.';
  end if;

  select *
  into current_supplier
  from public.inventory_suppliers
  where id = current_order.supplier_id;

  found_session_id := p_register_session_id;
  found_drawer_id := p_drawer_id;

  if found_session_id is null then
    found_session_id := public.find_open_cash_session(coalesce(nullif(trim(coalesce(p_city, '')), ''), current_order.city), found_drawer_id);
  end if;

  if found_drawer_id is null and found_session_id is not null then
    select drawer_id
    into found_drawer_id
    from public.cash_register_sessions
    where id = found_session_id;
  end if;

  insert into public.cash_movements (
    movement_type,
    amount,
    register_session_id,
    drawer_id,
    payment_method,
    source_module,
    concept,
    reference_name,
    city,
    movement_date,
    status,
    notes,
    movement_category,
    source_table,
    source_id,
    linked_label,
    auto_created,
    approved_at,
    approved_by,
    attachment_path,
    metadata,
    created_by,
    updated_by
  )
  values (
    'egreso',
    p_amount,
    found_session_id,
    found_drawer_id,
    p_payment_method,
    'inventario',
    format('Pago a proveedor %s', coalesce(current_supplier.name, 'sin nombre')),
    coalesce(nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(current_order.invoice_number, '')), ''), nullif(trim(coalesce(current_order.order_number, '')), '')),
    coalesce(nullif(trim(coalesce(p_city, '')), ''), current_order.city),
    coalesce(p_payment_date, current_date),
    'confirmado',
    nullif(trim(coalesce(p_notes, '')), ''),
    'proveedores',
    'inventory_supplier_orders',
    current_order.id,
    coalesce(current_supplier.name, 'Proveedor'),
    true,
    now(),
    auth.uid(),
    nullif(trim(coalesce(p_receipt_path, '')), ''),
    jsonb_build_object(
      'supplier_id', current_order.supplier_id,
      'order_id', current_order.id,
      'order_kind', current_order.order_kind,
      'invoice_number', current_order.invoice_number,
      'order_number', current_order.order_number
    ),
    auth.uid(),
    auth.uid()
  )
  returning id into movement_id;

  insert into public.inventory_supplier_order_payments (
    order_id,
    cash_movement_id,
    payment_date,
    amount,
    payment_method,
    reference,
    notes,
    receipt_path,
    status,
    created_by,
    updated_by
  )
  values (
    current_order.id,
    movement_id,
    coalesce(p_payment_date, current_date),
    p_amount,
    p_payment_method,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_receipt_path, '')), ''),
    'registrado',
    auth.uid(),
    auth.uid()
  )
  returning * into inserted_payment;

  perform public.recalculate_inventory_supplier_order(current_order.id);

  return inserted_payment;
end;
$$;

alter table public.inventory_supplier_orders enable row level security;
alter table public.inventory_supplier_order_items enable row level security;
alter table public.inventory_supplier_order_payments enable row level security;

drop policy if exists "Staff manage inventory supplier orders" on public.inventory_supplier_orders;
create policy "Staff manage inventory supplier orders"
on public.inventory_supplier_orders
for all
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "Staff manage inventory supplier order items" on public.inventory_supplier_order_items;
create policy "Staff manage inventory supplier order items"
on public.inventory_supplier_order_items
for all
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "Staff manage inventory supplier order payments" on public.inventory_supplier_order_payments;
create policy "Staff manage inventory supplier order payments"
on public.inventory_supplier_order_payments
for all
using (public.is_staff())
with check (public.is_staff());

grant select, insert, update, delete on public.inventory_supplier_orders to authenticated;
grant select, insert, update, delete on public.inventory_supplier_order_items to authenticated;
grant select, insert, update, delete on public.inventory_supplier_order_payments to authenticated;
grant execute on function public.recalculate_inventory_supplier_order(uuid) to authenticated;
grant execute on function public.receive_inventory_supplier_order(uuid, timestamptz) to authenticated;
grant execute on function public.register_inventory_supplier_order_payment(uuid, numeric, text, date, text, text, text, uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
