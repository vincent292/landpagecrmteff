alter table public.promotions
  add column if not exists allows_direct_booking boolean not null default false,
  add column if not exists allows_partial_payment boolean not null default false,
  add column if not exists partial_payment_percent numeric(5,2) not null default 50;

create table if not exists public.promotion_variants (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  title text not null,
  price_total numeric(12,2) not null,
  available_slots integer not null default 0,
  approved_slots integer not null default 0,
  allows_partial_payment boolean not null default false,
  partial_payment_percent numeric(5,2) not null default 50,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_variants_price_positive check (price_total > 0),
  constraint promotion_variants_available_slots_nonnegative check (available_slots >= 0),
  constraint promotion_variants_approved_slots_nonnegative check (approved_slots >= 0),
  constraint promotion_variants_partial_payment_percent_range check (partial_payment_percent >= 0 and partial_payment_percent <= 100)
);

create index if not exists promotion_variants_promotion_idx on public.promotion_variants(promotion_id, sort_order, created_at);
create index if not exists promotion_variants_active_idx on public.promotion_variants(is_active, promotion_id);

drop trigger if exists promotion_variants_touch_updated_at on public.promotion_variants;
create trigger promotion_variants_touch_updated_at
before update on public.promotion_variants
for each row
execute function public.set_row_updated_at();

create table if not exists public.promotion_orders (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  variant_id uuid not null references public.promotion_variants(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  document_number text,
  phone text,
  email text not null,
  city text,
  notes text,
  wants_appointment boolean not null default true,
  payment_mode text not null default 'total',
  payment_percent numeric(5,2) not null default 100,
  total_amount numeric(12,2) not null,
  amount_paid numeric(12,2),
  amount_pending numeric(12,2),
  payment_method text,
  payment_receipt_path text,
  payment_submitted_at timestamptz,
  payment_verified_at timestamptz,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  cash_recorded_at timestamptz,
  status text not null default 'Pendiente',
  admin_notes text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_role text,
  deleted_by_name text,
  deleted_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_orders_payment_mode_check check (payment_mode in ('total', 'anticipo')),
  constraint promotion_orders_status_check check (status in ('Pendiente', 'En revision', 'Aprobado', 'Rechazado', 'Cancelado')),
  constraint promotion_orders_total_positive check (total_amount > 0),
  constraint promotion_orders_amount_paid_nonnegative check (amount_paid is null or amount_paid >= 0),
  constraint promotion_orders_amount_pending_nonnegative check (amount_pending is null or amount_pending >= 0),
  constraint promotion_orders_payment_percent_range check (payment_percent >= 0 and payment_percent <= 100)
);

create index if not exists promotion_orders_user_idx on public.promotion_orders(user_id, created_at desc);
create index if not exists promotion_orders_variant_idx on public.promotion_orders(variant_id, created_at desc);
create index if not exists promotion_orders_status_idx on public.promotion_orders(status, created_at desc);
create index if not exists promotion_orders_deleted_idx on public.promotion_orders(is_deleted, created_at desc);

drop trigger if exists promotion_orders_touch_updated_at on public.promotion_orders;
create trigger promotion_orders_touch_updated_at
before update on public.promotion_orders
for each row
execute function public.set_row_updated_at();

alter table public.promotion_variants enable row level security;
alter table public.promotion_orders enable row level security;

drop policy if exists "Public read active promotion variants" on public.promotion_variants;
create policy "Public read active promotion variants"
on public.promotion_variants
for select
using (
  is_active = true
  and exists (
    select 1
    from public.promotions
    where promotions.id = promotion_variants.promotion_id
      and promotions.is_active = true
      and promotions.deleted_at is null
  )
);

drop policy if exists "Staff manage promotion variants" on public.promotion_variants;
create policy "Staff manage promotion variants"
on public.promotion_variants
for all
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "Users read own promotion orders" on public.promotion_orders;
create policy "Users read own promotion orders"
on public.promotion_orders
for select
using (auth.uid() = user_id or public.is_staff());

drop policy if exists "Users create own promotion orders" on public.promotion_orders;
create policy "Users create own promotion orders"
on public.promotion_orders
for insert
with check (auth.uid() = user_id or public.is_staff());

drop policy if exists "Users update own promotion orders" on public.promotion_orders;
create policy "Users update own promotion orders"
on public.promotion_orders
for update
using (auth.uid() = user_id or public.is_staff())
with check (auth.uid() = user_id or public.is_staff());

drop policy if exists "Staff manage promotion orders delete" on public.promotion_orders;
create policy "Staff manage promotion orders delete"
on public.promotion_orders
for delete
using (public.is_staff());

create or replace function public.approve_promotion_order(
  p_order_id uuid,
  p_payment_amount numeric,
  p_payment_method text,
  p_admin_notes text default null
)
returns public.promotion_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.promotion_orders%rowtype;
  variant_row public.promotion_variants%rowtype;
  payment_amount numeric(12,2);
  cash_id uuid;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'No autorizado para aprobar pedidos de promociones.';
  end if;

  select *
  into order_row
  from public.promotion_orders
  where id = p_order_id
    and is_deleted = false
  for update;

  if order_row.id is null then
    raise exception 'No encontramos el pedido de promocion.';
  end if;

  select *
  into variant_row
  from public.promotion_variants
  where id = order_row.variant_id
  for update;

  if variant_row.id is null or not variant_row.is_active then
    raise exception 'La variante seleccionada ya no esta disponible.';
  end if;

  if order_row.status <> 'Aprobado' and (variant_row.available_slots - variant_row.approved_slots) <= 0 then
    raise exception 'Ya no quedan cupos disponibles para esta opcion.';
  end if;

  payment_amount := coalesce(p_payment_amount, order_row.amount_paid, 0);
  if payment_amount <= 0 then
    raise exception 'Debes indicar un monto valido para aprobar el pedido.';
  end if;

  cash_id := public.ensure_cash_income_movement(
    'promotion_orders',
    order_row.id,
    payment_amount,
    p_payment_method,
    order_row.city,
    null,
    'promociones',
    'Pago de promocion aprobado',
    order_row.full_name,
    p_admin_notes,
    jsonb_build_object(
      'promotion_id', order_row.promotion_id,
      'variant_id', order_row.variant_id,
      'payment_mode', order_row.payment_mode,
      'total_amount', order_row.total_amount
    )
  );

  if order_row.status <> 'Aprobado' then
    update public.promotion_variants
    set approved_slots = approved_slots + 1
    where id = variant_row.id;
  end if;

  update public.promotion_orders
  set
    status = 'Aprobado',
    admin_notes = p_admin_notes,
    payment_method = coalesce(nullif(trim(coalesce(p_payment_method, '')), ''), payment_method, 'qr'),
    amount_paid = payment_amount,
    amount_pending = greatest(total_amount - payment_amount, 0),
    payment_verified_at = now(),
    cash_movement_id = cash_id,
    cash_recorded_at = now(),
    updated_at = now()
  where id = order_row.id
  returning *
  into order_row;

  return order_row;
end;
$$;

create or replace function public.set_promotion_order_status(
  p_order_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns public.promotion_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.promotion_orders%rowtype;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'No autorizado para actualizar pedidos de promociones.';
  end if;

  if p_status not in ('Pendiente', 'En revision', 'Aprobado', 'Rechazado', 'Cancelado') then
    raise exception 'Estado de pedido no valido.';
  end if;

  if p_status = 'Aprobado' then
    raise exception 'Usa approve_promotion_order para aprobar pedidos.';
  end if;

  select *
  into order_row
  from public.promotion_orders
  where id = p_order_id
    and is_deleted = false
  for update;

  if order_row.id is null then
    raise exception 'No encontramos el pedido de promocion.';
  end if;

  if order_row.status = 'Aprobado' and p_status <> 'Aprobado' then
    update public.promotion_variants
    set approved_slots = greatest(approved_slots - 1, 0)
    where id = order_row.variant_id;

    perform public.cancel_cash_movement_for_source(
      'promotion_orders',
      order_row.id,
      coalesce(nullif(trim(coalesce(p_admin_notes, '')), ''), 'Pedido movido fuera de aprobado.')
    );
  end if;

  update public.promotion_orders
  set
    status = p_status,
    admin_notes = p_admin_notes,
    updated_at = now()
  where id = order_row.id
  returning *
  into order_row;

  return order_row;
end;
$$;

grant execute on function public.approve_promotion_order(uuid, numeric, text, text) to authenticated;
grant execute on function public.set_promotion_order_status(uuid, text, text) to authenticated;
