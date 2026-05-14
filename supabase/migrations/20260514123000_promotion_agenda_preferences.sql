alter table public.doctor_availability_rules
  add column if not exists agenda_tag text;

alter table public.promotions
  add column if not exists agenda_mode text not null default 'coordinate',
  add column if not exists appointment_type text not null default 'Promocion directa',
  add column if not exists agenda_tag text;

alter table public.treatments
  add column if not exists agenda_mode text not null default 'coordinate',
  add column if not exists appointment_type text not null default 'Valoracion estetica',
  add column if not exists agenda_tag text;

alter table public.promotion_orders
  add column if not exists preferred_rule_id uuid references public.doctor_availability_rules(id) on delete set null,
  add column if not exists preferred_appointment_date date,
  add column if not exists preferred_start_time time,
  add column if not exists preferred_end_time time,
  add column if not exists preferred_city text,
  add column if not exists preferred_location text,
  add column if not exists preferred_appointment_type text,
  add column if not exists preferred_agenda_tag text,
  add column if not exists appointment_reservation_id uuid references public.appointment_reservations(id) on delete set null;

create index if not exists doctor_availability_rules_agenda_tag_idx
on public.doctor_availability_rules(agenda_tag)
where agenda_tag is not null;

create index if not exists promotion_orders_preferred_slot_idx
on public.promotion_orders(preferred_rule_id, preferred_appointment_date, preferred_start_time)
where preferred_rule_id is not null;

drop function if exists public.get_available_slots(text, text, date, date);

create or replace function public.get_available_slots(
  p_city text default null,
  p_appointment_type text default null,
  p_date_from date default current_date,
  p_date_to date default current_date + 45,
  p_doctor_id uuid default null,
  p_agenda_tag text default null
)
returns table (
  rule_id uuid,
  doctor_id uuid,
  agenda_tag text,
  date date,
  start_time time,
  end_time time,
  city text,
  location text,
  appointment_type text,
  available_capacity int,
  total_capacity int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d date;
  clean_agenda_tag text := nullif(trim(coalesce(p_agenda_tag, '')), '');
  rule_row public.doctor_availability_rules%rowtype;
  slot_start time;
  slot_end time;
  taken_count int;
  blocked boolean;
begin
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    return;
  end if;

  for d in
    select generate_series(p_date_from, p_date_to, interval '1 day')::date
  loop
    for rule_row in
      select *
      from public.doctor_availability_rules r
      where r.is_active = true
        and (p_city is null or p_city = '' or r.city = p_city)
        and (p_appointment_type is null or p_appointment_type = '' or r.appointment_type = p_appointment_type)
        and (p_doctor_id is null or r.doctor_id = p_doctor_id)
        and (
          (clean_agenda_tag is null and r.agenda_tag is null)
          or (clean_agenda_tag is not null and r.agenda_tag = clean_agenda_tag)
        )
        and (
          (r.availability_type = 'specific' and r.specific_date = d)
          or (
            r.availability_type = 'recurring'
            and r.day_of_week = extract(dow from d)::int
            and (r.start_date is null or r.start_date <= d)
            and (r.end_date is null or r.end_date >= d)
          )
        )
    loop
      slot_start := rule_row.start_time;
      loop
        slot_end := ('2000-01-01'::date + slot_start + make_interval(mins => rule_row.slot_duration_minutes))::time;
        exit when slot_end > rule_row.end_time or slot_end <= slot_start;

        if d > current_date or (d = current_date and slot_start > current_time) then
          select exists (
            select 1
            from public.availability_blocks b
            where b.is_active = true
              and b.block_date = d
              and (b.doctor_id is null or b.doctor_id = rule_row.doctor_id)
              and (b.city is null or b.city = rule_row.city)
              and (
                (b.start_time is null and b.end_time is null)
                or (slot_start < b.end_time and slot_end > b.start_time)
              )
          ) into blocked;

          if not blocked then
            select count(*)::int
            from public.appointment_reservations ar
            where ar.appointment_date = d
              and ar.city = rule_row.city
              and ar.appointment_type = rule_row.appointment_type
              and ar.start_time = slot_start
              and ar.end_time = slot_end
              and (ar.doctor_id is null or ar.doctor_id = rule_row.doctor_id)
              and ar.status in ('Pendiente', 'Confirmada', 'Realizada')
            into taken_count;

            if taken_count < rule_row.capacity_per_slot then
              rule_id := rule_row.id;
              doctor_id := rule_row.doctor_id;
              agenda_tag := rule_row.agenda_tag;
              date := d;
              start_time := slot_start;
              end_time := slot_end;
              city := rule_row.city;
              location := rule_row.location;
              appointment_type := rule_row.appointment_type;
              available_capacity := rule_row.capacity_per_slot - taken_count;
              total_capacity := rule_row.capacity_per_slot;
              return next;
            end if;
          end if;
        end if;

        slot_start := ('2000-01-01'::date + slot_start + make_interval(mins => rule_row.slot_duration_minutes + rule_row.break_minutes))::time;
      end loop;
    end loop;
  end loop;
end;
$$;

grant execute on function public.get_available_slots(text, text, date, date, uuid, text) to anon, authenticated;

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

  if order_row.wants_appointment
     and order_row.preferred_rule_id is not null
     and order_row.appointment_reservation_id is null then
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

    reservation_row := public.book_appointment_slot(
      order_row.user_id,
      patient_uuid,
      order_row.preferred_rule_id,
      order_row.preferred_appointment_date,
      order_row.preferred_start_time,
      order_row.preferred_end_time,
      coalesce(order_row.preferred_city, order_row.city),
      order_row.preferred_appointment_type,
      concat(
        'Promocion aprobada: ',
        coalesce((select title from public.promotions where id = order_row.promotion_id), 'Promocion'),
        '. Pedido: ',
        order_row.id,
        '. Opciones: ',
        coalesce(item_titles, 'opciones'),
        case when order_row.notes is not null and trim(order_row.notes) <> '' then concat('. Notas: ', order_row.notes) else '' end
      )
    );

    update public.appointment_reservations
    set
      status = 'Confirmada',
      title = 'Promocion directa',
      source = 'promotion_order',
      admin_notes = coalesce(p_admin_notes, admin_notes),
      updated_at = now()
    where id = reservation_row.id
    returning * into reservation_row;
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
      'appointment_reservation_id', reservation_row.id,
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
    appointment_reservation_id = coalesce(order_row.appointment_reservation_id, reservation_row.id),
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

    if order_row.appointment_reservation_id is not null then
      update public.appointment_reservations
      set
        status = 'Cancelada',
        admin_notes = coalesce(nullif(trim(coalesce(p_admin_notes, '')), ''), 'Pedido de promocion movido fuera de aprobado.'),
        updated_at = now()
      where id = order_row.appointment_reservation_id
        and status in ('Pendiente', 'Confirmada');
    end if;
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

notify pgrst, 'reload schema';
