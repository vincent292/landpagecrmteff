alter table public.promotion_orders
  alter column user_id drop not null;

alter table if exists public.treatment_orders
  alter column user_id drop not null;

drop policy if exists "Public create promotion orders without login" on public.promotion_orders;
create policy "Public create promotion orders without login"
on public.promotion_orders
for insert
to anon
with check (
  user_id is null
  and status = 'Pendiente'
  and full_name is not null
  and length(trim(full_name)) > 0
  and email is not null
  and length(trim(email)) > 0
  and phone is not null
  and length(trim(phone)) > 0
  and document_number is not null
  and length(trim(document_number)) > 0
  and total_amount > 0
);

drop policy if exists "Public attach promotion order receipt without login" on public.promotion_orders;
create policy "Public attach promotion order receipt without login"
on public.promotion_orders
for update
to anon
using (
  user_id is null
  and is_deleted = false
  and status in ('Pendiente', 'En revision')
)
with check (
  user_id is null
  and is_deleted = false
  and status = 'En revision'
  and payment_receipt_path is not null
  and payment_submitted_at is not null
);

drop policy if exists "Public create promotion order items without login" on public.promotion_order_items;
create or replace function public.is_public_pending_promotion_order(p_order_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.promotion_orders
    where id = p_order_id
      and user_id is null
      and status = 'Pendiente'
      and is_deleted = false
  );
$$;

create policy "Public create promotion order items without login"
on public.promotion_order_items
for insert
to anon
with check (
  public.is_public_pending_promotion_order(order_id)
);

do $$
begin
  if to_regclass('public.treatment_orders') is not null then
    drop policy if exists "Public create treatment orders without login" on public.treatment_orders;
    create policy "Public create treatment orders without login"
    on public.treatment_orders
    for insert
    to anon
    with check (
      user_id is null
      and status = 'Pendiente'
      and full_name is not null
      and length(trim(full_name)) > 0
      and email is not null
      and length(trim(email)) > 0
      and phone is not null
      and length(trim(phone)) > 0
      and document_number is not null
      and length(trim(document_number)) > 0
      and total_amount > 0
    );

    drop policy if exists "Public attach treatment order receipt without login" on public.treatment_orders;
    create policy "Public attach treatment order receipt without login"
    on public.treatment_orders
    for update
    to anon
    using (
      user_id is null
      and is_deleted = false
      and status in ('Pendiente', 'En revision')
    )
    with check (
      user_id is null
      and is_deleted = false
      and status = 'En revision'
      and payment_receipt_path is not null
      and payment_submitted_at is not null
    );
  end if;
end $$;

create or replace function public.ensure_default_promotion_variant(p_promotion_id uuid)
returns public.promotion_variants
language plpgsql
security definer
set search_path = public
as $$
declare
  promotion_row public.promotions%rowtype;
  variant_row public.promotion_variants%rowtype;
begin
  select *
  into variant_row
  from public.promotion_variants
  where promotion_id = p_promotion_id
    and is_active = true
  order by sort_order, created_at
  limit 1;

  if variant_row.id is not null then
    return variant_row;
  end if;

  select *
  into promotion_row
  from public.promotions
  where id = p_promotion_id
    and is_active = true
    and deleted_at is null
  for update;

  if promotion_row.id is null then
    raise exception 'No encontramos esta promocion activa.';
  end if;

  if coalesce(promotion_row.promo_price, 0) <= 0 then
    raise exception 'Esta promocion aun no tiene precio configurado para reservar y pagar.';
  end if;

  insert into public.promotion_variants (
    promotion_id,
    title,
    price_total,
    available_slots,
    approved_slots,
    allows_partial_payment,
    partial_payment_percent,
    sort_order,
    is_active
  )
  values (
    promotion_row.id,
    coalesce(nullif(trim(promotion_row.title), ''), 'Promocion'),
    promotion_row.promo_price,
    case when coalesce(promotion_row.available_slots, 0) > 0 then promotion_row.available_slots else 999999 end,
    0,
    coalesce(promotion_row.allows_partial_payment, false),
    coalesce(promotion_row.partial_payment_percent, 50),
    0,
    true
  )
  returning * into variant_row;

  update public.promotions
  set allows_direct_booking = true
  where id = promotion_row.id;

  return variant_row;
end;
$$;

grant execute on function public.ensure_default_promotion_variant(uuid) to anon;
grant execute on function public.ensure_default_promotion_variant(uuid) to authenticated;
grant execute on function public.is_public_pending_promotion_order(uuid) to anon;
grant execute on function public.is_public_pending_promotion_order(uuid) to authenticated;

notify pgrst, 'reload schema';
