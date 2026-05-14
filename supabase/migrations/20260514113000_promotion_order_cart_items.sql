create table if not exists public.promotion_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.promotion_orders(id) on delete cascade,
  variant_id uuid not null references public.promotion_variants(id) on delete restrict,
  title_snapshot text not null,
  unit_price numeric(12,2) not null,
  quantity integer not null default 1,
  created_at timestamptz not null default now(),
  constraint promotion_order_items_unit_price_positive check (unit_price > 0),
  constraint promotion_order_items_quantity_positive check (quantity > 0),
  constraint promotion_order_items_unique_variant unique (order_id, variant_id)
);

create index if not exists promotion_order_items_order_idx on public.promotion_order_items(order_id);
create index if not exists promotion_order_items_variant_idx on public.promotion_order_items(variant_id);

alter table public.promotion_order_items enable row level security;

drop policy if exists "Users read own promotion order items" on public.promotion_order_items;
create policy "Users read own promotion order items"
on public.promotion_order_items
for select
using (
  public.is_staff()
  or exists (
    select 1
    from public.promotion_orders
    where promotion_orders.id = promotion_order_items.order_id
      and promotion_orders.user_id = auth.uid()
  )
);

drop policy if exists "Users create own promotion order items" on public.promotion_order_items;
create policy "Users create own promotion order items"
on public.promotion_order_items
for insert
with check (
  public.is_staff()
  or exists (
    select 1
    from public.promotion_orders
    where promotion_orders.id = promotion_order_items.order_id
      and promotion_orders.user_id = auth.uid()
      and promotion_orders.status in ('Pendiente', 'Rechazado')
  )
);

drop policy if exists "Users update own promotion order items" on public.promotion_order_items;
create policy "Users update own promotion order items"
on public.promotion_order_items
for update
using (
  public.is_staff()
  or exists (
    select 1
    from public.promotion_orders
    where promotion_orders.id = promotion_order_items.order_id
      and promotion_orders.user_id = auth.uid()
      and promotion_orders.status in ('Pendiente', 'Rechazado')
  )
)
with check (
  public.is_staff()
  or exists (
    select 1
    from public.promotion_orders
    where promotion_orders.id = promotion_order_items.order_id
      and promotion_orders.user_id = auth.uid()
      and promotion_orders.status in ('Pendiente', 'Rechazado')
  )
);

drop policy if exists "Users delete own promotion order items" on public.promotion_order_items;
create policy "Users delete own promotion order items"
on public.promotion_order_items
for delete
using (
  public.is_staff()
  or exists (
    select 1
    from public.promotion_orders
    where promotion_orders.id = promotion_order_items.order_id
      and promotion_orders.user_id = auth.uid()
      and promotion_orders.status in ('Pendiente', 'Rechazado')
  )
);

insert into public.promotion_order_items (order_id, variant_id, title_snapshot, unit_price, quantity)
select
  orders.id,
  variants.id,
  variants.title,
  variants.price_total,
  1
from public.promotion_orders orders
join public.promotion_variants variants on variants.id = orders.variant_id
where not exists (
  select 1
  from public.promotion_order_items items
  where items.order_id = orders.id
    and items.variant_id = variants.id
);

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
  payment_amount numeric(12,2);
  cash_id uuid;
  item_row record;
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

  if not exists (select 1 from public.promotion_order_items where order_id = order_row.id) then
    raise exception 'Este pedido no tiene opciones seleccionadas.';
  end if;

  for item_row in
    select
      items.variant_id,
      items.quantity,
      variants.title,
      variants.available_slots,
      variants.approved_slots,
      variants.is_active
    from public.promotion_order_items items
    join public.promotion_variants variants on variants.id = items.variant_id
    where items.order_id = order_row.id
    for update of variants
  loop
    if not item_row.is_active then
      raise exception 'La opcion "%" ya no esta disponible.', item_row.title;
    end if;

    if order_row.status <> 'Aprobado' and (item_row.available_slots - item_row.approved_slots) < item_row.quantity then
      raise exception 'No quedan cupos suficientes para "%".', item_row.title;
    end if;
  end loop;

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
      'payment_mode', order_row.payment_mode,
      'total_amount', order_row.total_amount,
      'items', (
        select jsonb_agg(
          jsonb_build_object(
            'variant_id', items.variant_id,
            'title', items.title_snapshot,
            'unit_price', items.unit_price,
            'quantity', items.quantity
          )
        )
        from public.promotion_order_items items
        where items.order_id = order_row.id
      )
    )
  );

  if order_row.status <> 'Aprobado' then
    update public.promotion_variants variants
    set approved_slots = variants.approved_slots + items.quantity
    from public.promotion_order_items items
    where items.order_id = order_row.id
      and variants.id = items.variant_id;
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
    update public.promotion_variants variants
    set approved_slots = greatest(variants.approved_slots - items.quantity, 0)
    from public.promotion_order_items items
    where items.order_id = order_row.id
      and variants.id = items.variant_id;

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
