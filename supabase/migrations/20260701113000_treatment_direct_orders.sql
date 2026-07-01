alter table public.treatments
  add column if not exists treatment_price numeric(12,2),
  add column if not exists available_slots integer not null default 0,
  add column if not exists approved_slots integer not null default 0,
  add column if not exists allows_direct_booking boolean not null default false,
  add column if not exists allows_partial_payment boolean not null default false,
  add column if not exists partial_payment_percent numeric(5,2) not null default 50;

alter table public.treatments
  drop constraint if exists treatments_direct_price_positive,
  add constraint treatments_direct_price_positive check (treatment_price is null or treatment_price > 0);

alter table public.treatments
  drop constraint if exists treatments_available_slots_nonnegative,
  add constraint treatments_available_slots_nonnegative check (available_slots >= 0);

alter table public.treatments
  drop constraint if exists treatments_approved_slots_nonnegative,
  add constraint treatments_approved_slots_nonnegative check (approved_slots >= 0);

alter table public.treatments
  drop constraint if exists treatments_partial_payment_percent_range,
  add constraint treatments_partial_payment_percent_range check (partial_payment_percent >= 0 and partial_payment_percent <= 100);

create table if not exists public.treatment_orders (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references public.treatments(id) on delete cascade,
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
  preferred_rule_id uuid references public.doctor_availability_rules(id) on delete set null,
  preferred_appointment_date date,
  preferred_start_time time,
  preferred_end_time time,
  preferred_city text,
  preferred_location text,
  preferred_appointment_type text,
  preferred_agenda_tag text,
  appointment_reservation_id uuid references public.appointment_reservations(id) on delete set null,
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
  constraint treatment_orders_payment_mode_check check (payment_mode in ('total', 'anticipo')),
  constraint treatment_orders_status_check check (status in ('Pendiente', 'En revision', 'Aprobado', 'Rechazado', 'Cancelado')),
  constraint treatment_orders_total_positive check (total_amount > 0),
  constraint treatment_orders_amount_paid_nonnegative check (amount_paid is null or amount_paid >= 0),
  constraint treatment_orders_amount_pending_nonnegative check (amount_pending is null or amount_pending >= 0),
  constraint treatment_orders_payment_percent_range check (payment_percent >= 0 and payment_percent <= 100)
);

create index if not exists treatment_orders_user_idx on public.treatment_orders(user_id, created_at desc);
create index if not exists treatment_orders_treatment_idx on public.treatment_orders(treatment_id, created_at desc);
create index if not exists treatment_orders_status_idx on public.treatment_orders(status, created_at desc);
create index if not exists treatment_orders_deleted_idx on public.treatment_orders(is_deleted, created_at desc);
create index if not exists treatment_orders_preferred_slot_idx on public.treatment_orders(preferred_rule_id, preferred_appointment_date, preferred_start_time)
  where preferred_rule_id is not null;

drop trigger if exists treatment_orders_touch_updated_at on public.treatment_orders;
create trigger treatment_orders_touch_updated_at
before update on public.treatment_orders
for each row
execute function public.set_row_updated_at();

alter table public.treatment_orders enable row level security;

drop policy if exists "Users read own treatment orders" on public.treatment_orders;
create policy "Users read own treatment orders"
on public.treatment_orders
for select
using (auth.uid() = user_id or public.is_staff());

drop policy if exists "Users create own treatment orders" on public.treatment_orders;
create policy "Users create own treatment orders"
on public.treatment_orders
for insert
with check (auth.uid() = user_id or public.is_staff());

drop policy if exists "Users update own treatment orders" on public.treatment_orders;
create policy "Users update own treatment orders"
on public.treatment_orders
for update
using (auth.uid() = user_id or public.is_staff())
with check (auth.uid() = user_id or public.is_staff());

drop policy if exists "Staff manage treatment orders delete" on public.treatment_orders;
create policy "Staff manage treatment orders delete"
on public.treatment_orders
for delete
using (public.is_staff());

create or replace function public.approve_treatment_order(
  p_order_id uuid,
  p_payment_amount numeric,
  p_payment_method text,
  p_admin_notes text default null
)
returns public.treatment_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.treatment_orders%rowtype;
  treatment_row public.treatments%rowtype;
  payment_amount numeric(12,2);
  cash_id uuid;
  patient_uuid uuid;
  reservation_row public.appointment_reservations%rowtype;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'No autorizado para aprobar pedidos de tratamientos.';
  end if;

  select *
  into order_row
  from public.treatment_orders
  where id = p_order_id
    and is_deleted = false
  for update;

  if order_row.id is null then
    raise exception 'No encontramos el pedido de tratamiento.';
  end if;

  select *
  into treatment_row
  from public.treatments
  where id = order_row.treatment_id
    and is_active = true
    and deleted_at is null
  for update;

  if treatment_row.id is null or not coalesce(treatment_row.allows_direct_booking, false) then
    raise exception 'Este tratamiento ya no esta disponible para pago directo.';
  end if;

  if order_row.status <> 'Aprobado'
     and coalesce(treatment_row.available_slots, 0) > 0
     and (coalesce(treatment_row.available_slots, 0) - coalesce(treatment_row.approved_slots, 0)) <= 0 then
    raise exception 'Ya no quedan cupos disponibles para este tratamiento.';
  end if;

  payment_amount := coalesce(p_payment_amount, order_row.amount_paid, 0);
  if payment_amount <= 0 then
    raise exception 'Debes indicar un monto valido para aprobar el pedido.';
  end if;

  if order_row.wants_appointment
     and order_row.preferred_rule_id is not null
     and order_row.preferred_appointment_date is not null
     and order_row.preferred_start_time is not null
     and order_row.preferred_end_time is not null
     and order_row.preferred_appointment_type is not null
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
        'Tratamiento aprobado: ',
        coalesce(treatment_row.title, 'Tratamiento'),
        '. Pedido: ',
        order_row.id,
        case when order_row.notes is not null and trim(order_row.notes) <> '' then concat('. Notas: ', order_row.notes) else '' end
      )
    );

    update public.appointment_reservations
    set
      status = 'Confirmada',
      title = concat('Tratamiento directo: ', coalesce(treatment_row.title, 'Tratamiento')),
      source = 'treatment_order',
      admin_notes = coalesce(p_admin_notes, admin_notes),
      updated_at = now()
    where id = reservation_row.id
    returning * into reservation_row;

    order_row.appointment_reservation_id := reservation_row.id;
  end if;

  cash_id := public.ensure_cash_income_movement(
    'treatment_orders',
    order_row.id,
    payment_amount,
    p_payment_method,
    order_row.city,
    null,
    'tratamientos',
    'Pago de tratamiento aprobado',
    order_row.full_name,
    p_admin_notes,
    jsonb_build_object(
      'treatment_id', order_row.treatment_id,
      'payment_mode', order_row.payment_mode,
      'total_amount', order_row.total_amount,
      'appointment_reservation_id', order_row.appointment_reservation_id
    )
  );

  if order_row.status <> 'Aprobado' and coalesce(treatment_row.available_slots, 0) > 0 then
    update public.treatments
    set approved_slots = coalesce(approved_slots, 0) + 1
    where id = treatment_row.id;
  end if;

  update public.treatment_orders
  set
    status = 'Aprobado',
    admin_notes = p_admin_notes,
    payment_method = coalesce(nullif(trim(coalesce(p_payment_method, '')), ''), payment_method, 'qr'),
    amount_paid = payment_amount,
    amount_pending = greatest(total_amount - payment_amount, 0),
    payment_verified_at = now(),
    cash_movement_id = cash_id,
    cash_recorded_at = now(),
    appointment_reservation_id = coalesce(order_row.appointment_reservation_id, appointment_reservation_id),
    updated_at = now()
  where id = order_row.id
  returning *
  into order_row;

  return order_row;
end;
$$;

create or replace function public.set_treatment_order_status(
  p_order_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns public.treatment_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.treatment_orders%rowtype;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'No autorizado para actualizar pedidos de tratamientos.';
  end if;

  if p_status not in ('Pendiente', 'En revision', 'Aprobado', 'Rechazado', 'Cancelado') then
    raise exception 'Estado de pedido no valido.';
  end if;

  if p_status = 'Aprobado' then
    raise exception 'Usa approve_treatment_order para aprobar pedidos.';
  end if;

  select *
  into order_row
  from public.treatment_orders
  where id = p_order_id
    and is_deleted = false
  for update;

  if order_row.id is null then
    raise exception 'No encontramos el pedido de tratamiento.';
  end if;

  if order_row.status = 'Aprobado' and p_status <> 'Aprobado' then
    update public.treatments
    set approved_slots = greatest(coalesce(approved_slots, 0) - 1, 0)
    where id = order_row.treatment_id;

    perform public.cancel_cash_movement_for_source(
      'treatment_orders',
      order_row.id,
      coalesce(nullif(trim(coalesce(p_admin_notes, '')), ''), 'Pedido movido fuera de aprobado.')
    );

    update public.appointment_reservations
    set
      status = 'Cancelada',
      admin_notes = coalesce(nullif(trim(coalesce(p_admin_notes, '')), ''), 'Pedido de tratamiento movido fuera de aprobado.'),
      updated_at = now()
    where id = order_row.appointment_reservation_id
      and status in ('Pendiente', 'Confirmada');
  end if;

  update public.treatment_orders
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

grant execute on function public.approve_treatment_order(uuid, numeric, text, text) to authenticated;
grant execute on function public.set_treatment_order_status(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
