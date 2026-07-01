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
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion para reservar esta promocion.';
  end if;

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

grant execute on function public.ensure_default_promotion_variant(uuid) to authenticated;

notify pgrst, 'reload schema';
