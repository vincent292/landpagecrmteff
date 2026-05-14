alter table public.promotion_order_items
  add column if not exists preferred_rule_id uuid references public.doctor_availability_rules(id) on delete set null,
  add column if not exists preferred_appointment_date date,
  add column if not exists preferred_start_time time,
  add column if not exists preferred_end_time time,
  add column if not exists preferred_city text,
  add column if not exists preferred_location text,
  add column if not exists preferred_appointment_type text,
  add column if not exists preferred_agenda_tag text,
  add column if not exists appointment_reservation_id uuid references public.appointment_reservations(id) on delete set null;

create index if not exists promotion_order_items_preferred_slot_idx
on public.promotion_order_items(preferred_rule_id, preferred_appointment_date, preferred_start_time)
where preferred_rule_id is not null;

update public.promotion_order_items items
set
  preferred_rule_id = coalesce(items.preferred_rule_id, orders.preferred_rule_id),
  preferred_appointment_date = coalesce(items.preferred_appointment_date, orders.preferred_appointment_date),
  preferred_start_time = coalesce(items.preferred_start_time, orders.preferred_start_time),
  preferred_end_time = coalesce(items.preferred_end_time, orders.preferred_end_time),
  preferred_city = coalesce(items.preferred_city, orders.preferred_city),
  preferred_location = coalesce(items.preferred_location, orders.preferred_location),
  preferred_appointment_type = coalesce(items.preferred_appointment_type, orders.preferred_appointment_type),
  preferred_agenda_tag = coalesce(items.preferred_agenda_tag, orders.preferred_agenda_tag),
  appointment_reservation_id = coalesce(items.appointment_reservation_id, orders.appointment_reservation_id)
from public.promotion_orders orders
where orders.id = items.order_id;

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
  patient_uuid uuid;
  reservation_row public.appointment_reservations%rowtype;
  first_reservation_id uuid;
  item_titles text;
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

  select string_agg(items.title_snapshot, ', ' order by items.created_at)
  into item_titles
  from public.promotion_order_items items
  where items.order_id = order_row.id;

  if order_row.wants_appointment and exists (
    select 1
    from public.promotion_order_items items
    where items.order_id = order_row.id
      and (
        items.preferred_rule_id is not null
        or order_row.preferred_rule_id is not null
      )
  ) then
    select id
    into patient_uuid
    from public.patients
    where profile_id = order_row.user_id
    limit 1;

    if patient_uuid is null then
      insert into public.patients (profile_id, full_name, phone, email, city, document_number)
      values (
        order_row.user_id,
        coalesce(nullif(order_row.full_name, ''), 'Paciente'),
        order_row.phone,
        order_row.email,
        order_row.city,
        order_row.document_number
      )
      returning id into patient_uuid;
    else
      update public.patients
      set
        full_name = coalesce(nullif(order_row.full_name, ''), full_name),
        phone = coalesce(order_row.phone, phone),
        email = coalesce(order_row.email, email),
        city = coalesce(order_row.city, city),
        document_number = coalesce(order_row.document_number, document_number)
      where id = patient_uuid;
    end if;

    for item_row in
      select
        items.id as item_id,
        items.title_snapshot,
        coalesce(items.preferred_rule_id, order_row.preferred_rule_id) as preferred_rule_id,
        coalesce(items.preferred_appointment_date, order_row.preferred_appointment_date) as preferred_appointment_date,
        coalesce(items.preferred_start_time, order_row.preferred_start_time) as preferred_start_time,
        coalesce(items.preferred_end_time, order_row.preferred_end_time) as preferred_end_time,
        coalesce(items.preferred_city, order_row.preferred_city, order_row.city) as preferred_city,
        coalesce(items.preferred_appointment_type, order_row.preferred_appointment_type) as preferred_appointment_type,
        items.appointment_reservation_id
      from public.promotion_order_items items
      where items.order_id = order_row.id
      order by items.created_at, items.id
    loop
      if item_row.preferred_rule_id is null
         or item_row.preferred_appointment_date is null
         or item_row.preferred_start_time is null
         or item_row.preferred_end_time is null
         or item_row.preferred_appointment_type is null then
        continue;
      end if;

      if item_row.appointment_reservation_id is not null then
        first_reservation_id := coalesce(first_reservation_id, item_row.appointment_reservation_id);
        continue;
      end if;

      reservation_row := public.book_appointment_slot(
        order_row.user_id,
        patient_uuid,
        item_row.preferred_rule_id,
        item_row.preferred_appointment_date,
        item_row.preferred_start_time,
        item_row.preferred_end_time,
        item_row.preferred_city,
        item_row.preferred_appointment_type,
        concat(
          'Promocion aprobada: ',
          coalesce((select title from public.promotions where id = order_row.promotion_id), 'Promocion'),
          '. Opcion: ',
          coalesce(item_row.title_snapshot, 'opcion'),
          '. Pedido: ',
          order_row.id,
          case when order_row.notes is not null and trim(order_row.notes) <> '' then concat('. Notas: ', order_row.notes) else '' end
        )
      );

      update public.appointment_reservations
      set
        status = 'Confirmada',
        title = concat('Promocion directa: ', coalesce(item_row.title_snapshot, 'Opcion')),
        source = 'promotion_order',
        admin_notes = coalesce(p_admin_notes, admin_notes),
        updated_at = now()
      where id = reservation_row.id
      returning * into reservation_row;

      update public.promotion_order_items
      set appointment_reservation_id = reservation_row.id
      where id = item_row.item_id;

      first_reservation_id := coalesce(first_reservation_id, reservation_row.id);
    end loop;
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
      'appointment_reservation_id', first_reservation_id,
      'items', (
        select jsonb_agg(
          jsonb_build_object(
            'variant_id', items.variant_id,
            'title', items.title_snapshot,
            'unit_price', items.unit_price,
            'quantity', items.quantity,
            'appointment_reservation_id', items.appointment_reservation_id,
            'preferred_appointment_date', items.preferred_appointment_date,
            'preferred_start_time', items.preferred_start_time,
            'preferred_end_time', items.preferred_end_time
          )
          order by items.created_at, items.id
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
    appointment_reservation_id = coalesce(first_reservation_id, appointment_reservation_id),
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

    update public.appointment_reservations
    set
      status = 'Cancelada',
      admin_notes = coalesce(nullif(trim(coalesce(p_admin_notes, '')), ''), 'Pedido de promocion movido fuera de aprobado.'),
      updated_at = now()
    where id in (
      select items.appointment_reservation_id
      from public.promotion_order_items items
      where items.order_id = order_row.id
        and items.appointment_reservation_id is not null
    )
      and status in ('Pendiente', 'Confirmada');

    update public.promotion_order_items
    set appointment_reservation_id = null
    where order_id = order_row.id;
  end if;

  update public.promotion_orders
  set
    status = p_status,
    admin_notes = p_admin_notes,
    appointment_reservation_id = case when order_row.status = 'Aprobado' and p_status <> 'Aprobado' then null else appointment_reservation_id end,
    updated_at = now()
  where id = order_row.id
  returning *
  into order_row;

  return order_row;
end;
$$;

grant execute on function public.approve_promotion_order(uuid, numeric, text, text) to authenticated;
grant execute on function public.set_promotion_order_status(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
