create table if not exists public.cash_drawers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  location_name text,
  base_amount numeric(12,2) not null default 0,
  accepts_cash boolean not null default true,
  accepts_qr boolean not null default true,
  accepts_transfer boolean not null default true,
  accepts_card boolean not null default false,
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

create unique index if not exists cash_drawers_name_unique
on public.cash_drawers(lower(name), coalesce(lower(city), ''), coalesce(lower(location_name), ''))
where is_deleted = false;

create trigger cash_drawers_touch_updated_at
before update on public.cash_drawers
for each row
execute function public.set_row_updated_at();

create table if not exists public.cash_payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  method_kind text not null default 'other',
  sort_order int not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_payment_methods_kind_check check (method_kind in ('cash', 'digital', 'bank', 'card', 'other'))
);

create unique index if not exists cash_payment_methods_code_unique on public.cash_payment_methods(code);
create unique index if not exists cash_payment_methods_name_unique on public.cash_payment_methods(name);

create trigger cash_payment_methods_touch_updated_at
before update on public.cash_payment_methods
for each row
execute function public.set_row_updated_at();

create table if not exists public.cash_denominations (
  id uuid primary key default gen_random_uuid(),
  value numeric(12,2) not null,
  label text not null,
  unit_type text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_denominations_type_check check (unit_type in ('billete', 'moneda')),
  constraint cash_denominations_value_positive check (value > 0)
);

create unique index if not exists cash_denominations_value_unique on public.cash_denominations(value, unit_type);

create trigger cash_denominations_touch_updated_at
before update on public.cash_denominations
for each row
execute function public.set_row_updated_at();

create table if not exists public.cash_session_counts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_register_sessions(id) on delete cascade,
  count_type text not null,
  expected_amount numeric(12,2) not null default 0,
  counted_amount numeric(12,2) not null default 0,
  difference_amount numeric(12,2) not null default 0,
  notes text,
  counted_by uuid references public.profiles(id) on delete set null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_role text,
  deleted_by_name text,
  deleted_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_session_counts_type_check check (count_type in ('apertura', 'arqueo', 'cierre'))
);

create index if not exists cash_session_counts_session_idx
on public.cash_session_counts(session_id, created_at desc);

create trigger cash_session_counts_touch_updated_at
before update on public.cash_session_counts
for each row
execute function public.set_row_updated_at();

create table if not exists public.cash_session_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.cash_session_counts(id) on delete cascade,
  denomination_id uuid references public.cash_denominations(id) on delete set null,
  denomination_value numeric(12,2) not null,
  denomination_label text not null,
  unit_type text not null,
  quantity int not null default 0,
  subtotal numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint cash_session_count_lines_unit_check check (unit_type in ('billete', 'moneda')),
  constraint cash_session_count_lines_quantity_check check (quantity >= 0)
);

create index if not exists cash_session_count_lines_count_idx
on public.cash_session_count_lines(count_id, denomination_value desc);

alter table public.cash_register_sessions
  add column if not exists drawer_id uuid references public.cash_drawers(id) on delete set null;

alter table public.cash_movements
  add column if not exists drawer_id uuid references public.cash_drawers(id) on delete set null,
  add column if not exists movement_category text not null default 'operacion',
  add column if not exists source_table text,
  add column if not exists source_id uuid,
  add column if not exists linked_label text,
  add column if not exists auto_created boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists cash_movements_drawer_idx on public.cash_movements(drawer_id, movement_date desc);
create index if not exists cash_movements_source_idx on public.cash_movements(source_table, source_id);
create unique index if not exists cash_movements_auto_source_unique
on public.cash_movements(source_table, source_id)
where source_table is not null
  and source_id is not null
  and auto_created = true
  and movement_type = 'ingreso'
  and status <> 'anulado'
  and is_deleted = false;

alter table public.appointment_reservations
  add column if not exists payment_amount numeric(12,2),
  add column if not exists payment_method text,
  add column if not exists cash_movement_id uuid references public.cash_movements(id) on delete set null,
  add column if not exists cash_recorded_at timestamptz;

alter table public.course_enrollments
  add column if not exists payment_amount numeric(12,2),
  add column if not exists payment_method text,
  add column if not exists cash_movement_id uuid references public.cash_movements(id) on delete set null,
  add column if not exists cash_recorded_at timestamptz;

alter table public.book_orders
  add column if not exists payment_amount numeric(12,2),
  add column if not exists payment_method text,
  add column if not exists cash_movement_id uuid references public.cash_movements(id) on delete set null,
  add column if not exists cash_recorded_at timestamptz;

alter table public.appointments
  add column if not exists payment_amount numeric(12,2),
  add column if not exists payment_method text,
  add column if not exists payment_status text not null default 'Pendiente',
  add column if not exists cash_movement_id uuid references public.cash_movements(id) on delete set null,
  add column if not exists cash_recorded_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_payment_status_check'
  ) then
    alter table public.appointments
      add constraint appointments_payment_status_check
      check (payment_status in ('Pendiente', 'Pagado', 'Devuelto'));
  end if;
end $$;

insert into public.cash_payment_methods (code, name, method_kind, sort_order, is_default)
values
  ('efectivo', 'Efectivo', 'cash', 1, true),
  ('qr', 'QR', 'digital', 2, false),
  ('transferencia', 'Transferencia', 'bank', 3, false),
  ('tarjeta', 'Tarjeta', 'card', 4, false),
  ('deposito', 'Deposito bancario', 'bank', 5, false)
on conflict (code) do update
set
  name = excluded.name,
  method_kind = excluded.method_kind,
  sort_order = excluded.sort_order;

insert into public.cash_denominations (value, label, unit_type, sort_order)
values
  (200, 'Billete Bs 200', 'billete', 1),
  (100, 'Billete Bs 100', 'billete', 2),
  (50, 'Billete Bs 50', 'billete', 3),
  (20, 'Billete Bs 20', 'billete', 4),
  (10, 'Billete Bs 10', 'billete', 5),
  (5, 'Moneda Bs 5', 'moneda', 6),
  (2, 'Moneda Bs 2', 'moneda', 7),
  (1, 'Moneda Bs 1', 'moneda', 8),
  (0.50, 'Moneda Bs 0.50', 'moneda', 9)
on conflict (value, unit_type) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order;

create or replace function public.find_open_cash_session(
  p_city text default null,
  p_drawer_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found_session_id uuid;
begin
  if p_drawer_id is not null then
    select id
    into found_session_id
    from public.cash_register_sessions
    where drawer_id = p_drawer_id
      and status = 'abierta'
      and is_deleted = false
    order by session_date desc, opened_at desc
    limit 1;

    if found_session_id is not null then
      return found_session_id;
    end if;
  end if;

  if p_city is not null and trim(p_city) <> '' then
    select id
    into found_session_id
    from public.cash_register_sessions
    where status = 'abierta'
      and is_deleted = false
      and coalesce(city, '') = p_city
    order by session_date desc, opened_at desc
    limit 1;

    if found_session_id is not null then
      return found_session_id;
    end if;
  end if;

  select id
  into found_session_id
  from public.cash_register_sessions
  where status = 'abierta'
    and is_deleted = false
  order by session_date desc, opened_at desc
  limit 1;

  return found_session_id;
end;
$$;

create or replace function public.ensure_cash_income_movement(
  p_source_table text,
  p_source_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_city text default null,
  p_drawer_id uuid default null,
  p_source_module text default null,
  p_concept text default null,
  p_reference_name text default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_movement_id uuid;
  found_session_id uuid;
  resolved_drawer_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del ingreso debe ser mayor a cero.';
  end if;

  select id
  into existing_movement_id
  from public.cash_movements
  where source_table = p_source_table
    and source_id = p_source_id
    and auto_created = true
    and movement_type = 'ingreso'
    and status <> 'anulado'
    and is_deleted = false
  order by created_at desc
  limit 1;

  if existing_movement_id is not null then
    return existing_movement_id;
  end if;

  found_session_id := public.find_open_cash_session(p_city, p_drawer_id);

  if found_session_id is not null then
    select drawer_id
    into resolved_drawer_id
    from public.cash_register_sessions
    where id = found_session_id;
  else
    resolved_drawer_id := p_drawer_id;
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
    metadata
  )
  values (
    'ingreso',
    p_amount,
    found_session_id,
    resolved_drawer_id,
    coalesce(nullif(trim(coalesce(p_payment_method, '')), ''), 'qr'),
    coalesce(nullif(trim(coalesce(p_source_module, '')), ''), 'sistema'),
    coalesce(nullif(trim(coalesce(p_concept, '')), ''), 'Ingreso del sistema'),
    p_reference_name,
    nullif(trim(coalesce(p_city, '')), ''),
    current_date,
    'confirmado',
    nullif(trim(coalesce(p_notes, '')), ''),
    'venta',
    p_source_table,
    p_source_id,
    p_reference_name,
    true,
    now(),
    auth.uid(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id
  into existing_movement_id;

  return existing_movement_id;
end;
$$;

create or replace function public.cancel_cash_movement_for_source(
  p_source_table text,
  p_source_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cash_movements
  set
    status = 'anulado',
    notes = concat_ws(' | ', nullif(notes, ''), nullif(trim(coalesce(p_reason, '')), '')),
    updated_at = now()
  where source_table = p_source_table
    and source_id = p_source_id
    and auto_created = true
    and movement_type = 'ingreso'
    and status <> 'anulado'
    and is_deleted = false;
end;
$$;

create or replace function public.record_cash_session_count(
  p_session_id uuid,
  p_count_type text,
  p_notes text default null,
  p_lines jsonb default '[]'::jsonb
)
returns public.cash_session_counts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_session public.cash_register_sessions%rowtype;
  movement_total numeric(12,2);
  expected_total numeric(12,2);
  counted_total numeric(12,2) := 0;
  count_row public.cash_session_counts%rowtype;
  line_item jsonb;
  denomination_row public.cash_denominations%rowtype;
  line_quantity int;
  line_value numeric(12,2);
  line_label text;
  line_type text;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'Solo administracion puede registrar arqueos de caja.';
  end if;

  if p_count_type not in ('apertura', 'arqueo', 'cierre') then
    raise exception 'Tipo de arqueo no valido.';
  end if;

  select *
  into current_session
  from public.cash_register_sessions
  where id = p_session_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos la sesion de caja.';
  end if;

  select coalesce(sum(case when movement_type = 'ingreso' then amount else -amount end), 0)
  into movement_total
  from public.cash_movements
  where register_session_id = current_session.id
    and is_deleted = false
    and status <> 'anulado';

  expected_total := current_session.opening_amount + movement_total;

  insert into public.cash_session_counts (
    session_id,
    count_type,
    expected_amount,
    counted_amount,
    difference_amount,
    notes,
    counted_by
  )
  values (
    current_session.id,
    p_count_type,
    expected_total,
    0,
    0,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning *
  into count_row;

  for line_item in
    select value
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    line_quantity := greatest(coalesce((line_item ->> 'quantity')::int, 0), 0);
    line_value := coalesce((line_item ->> 'value')::numeric, 0);
    line_label := nullif(trim(coalesce(line_item ->> 'label', '')), '');
    line_type := coalesce(nullif(trim(coalesce(line_item ->> 'unit_type', '')), ''), 'billete');

    if line_quantity = 0 or line_value <= 0 then
      continue;
    end if;

    select *
    into denomination_row
    from public.cash_denominations
    where value = line_value
      and unit_type = line_type
    limit 1;

    insert into public.cash_session_count_lines (
      count_id,
      denomination_id,
      denomination_value,
      denomination_label,
      unit_type,
      quantity,
      subtotal
    )
    values (
      count_row.id,
      denomination_row.id,
      line_value,
      coalesce(line_label, denomination_row.label, concat('Bs ', line_value::text)),
      line_type,
      line_quantity,
      line_value * line_quantity
    );

    counted_total := counted_total + (line_value * line_quantity);
  end loop;

  update public.cash_session_counts
  set
    counted_amount = counted_total,
    difference_amount = counted_total - expected_total,
    updated_at = now()
  where id = count_row.id
  returning *
  into count_row;

  if p_count_type = 'cierre' then
    perform public.close_cash_register_session(current_session.id, counted_total, p_notes);
  end if;

  return count_row;
end;
$$;

create or replace function public.sync_course_enrollment_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  movement_id uuid;
  resolved_amount numeric(12,2);
  resolved_method text;
  course_title text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.is_deleted then
    if new.cash_movement_id is not null then
      perform public.cancel_cash_movement_for_source('course_enrollments', new.id, 'Inscripcion archivada o revertida.');
    end if;
    return new;
  end if;

  if new.status = 'Confirmado' then
    select title, coalesce(price, 0)
    into course_title, resolved_amount
    from public.courses
    where id = new.course_id;

    resolved_amount := coalesce(new.payment_amount, resolved_amount, 0);
    resolved_method := coalesce(nullif(trim(coalesce(new.payment_method, '')), ''), 'qr');

    if resolved_amount > 0 then
      movement_id := public.ensure_cash_income_movement(
        'course_enrollments',
        new.id,
        resolved_amount,
        resolved_method,
        new.city,
        null,
        'curso',
        concat('Inscripcion aprobada: ', coalesce(course_title, 'Curso')),
        coalesce(new.full_name, new.email, 'Alumno'),
        new.admin_notes,
        jsonb_build_object('course_id', new.course_id, 'status', new.status)
      );

      update public.course_enrollments
      set
        payment_amount = resolved_amount,
        payment_method = resolved_method,
        cash_movement_id = movement_id,
        cash_recorded_at = coalesce(cash_recorded_at, now()),
        payment_verified_at = coalesce(payment_verified_at, now())
      where id = new.id;
    end if;
  elsif tg_op = 'update' and old.status = 'Confirmado' and new.status <> 'Confirmado' and new.cash_movement_id is not null then
    perform public.cancel_cash_movement_for_source('course_enrollments', new.id, 'Inscripcion sacada de estado confirmado.');
  end if;

  return new;
end;
$$;

drop trigger if exists sync_course_enrollment_cash on public.course_enrollments;
create trigger sync_course_enrollment_cash
after insert or update on public.course_enrollments
for each row
execute function public.sync_course_enrollment_cash();

create or replace function public.sync_book_order_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  movement_id uuid;
  resolved_amount numeric(12,2);
  resolved_method text;
  book_title text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.is_deleted then
    if new.cash_movement_id is not null then
      perform public.cancel_cash_movement_for_source('book_orders', new.id, 'Pedido archivado o revertido.');
    end if;
    return new;
  end if;

  if new.status = 'Aprobado' then
    select title, coalesce(price, 0)
    into book_title, resolved_amount
    from public.books
    where id = new.book_id;

    resolved_amount := coalesce(new.payment_amount, resolved_amount, 0);
    resolved_method := coalesce(nullif(trim(coalesce(new.payment_method, '')), ''), 'qr');

    if resolved_amount > 0 then
      movement_id := public.ensure_cash_income_movement(
        'book_orders',
        new.id,
        resolved_amount,
        resolved_method,
        new.city,
        null,
        'libro',
        concat('Libro aprobado: ', coalesce(book_title, 'Libro digital')),
        coalesce(new.full_name, new.email, 'Cliente'),
        new.admin_notes,
        jsonb_build_object('book_id', new.book_id, 'status', new.status)
      );

      update public.book_orders
      set
        payment_amount = resolved_amount,
        payment_method = resolved_method,
        cash_movement_id = movement_id,
        cash_recorded_at = coalesce(cash_recorded_at, now()),
        verified_at = coalesce(verified_at, now())
      where id = new.id;
    end if;
  elsif tg_op = 'update' and old.status = 'Aprobado' and new.status <> 'Aprobado' and new.cash_movement_id is not null then
    perform public.cancel_cash_movement_for_source('book_orders', new.id, 'Pedido retirado del estado aprobado.');
  end if;

  return new;
end;
$$;

drop trigger if exists sync_book_order_cash on public.book_orders;
create trigger sync_book_order_cash
after insert or update on public.book_orders
for each row
execute function public.sync_book_order_cash();

create or replace function public.sync_appointment_reservation_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  movement_id uuid;
  resolved_amount numeric(12,2);
  resolved_method text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.is_deleted then
    if new.cash_movement_id is not null then
      perform public.cancel_cash_movement_for_source('appointment_reservations', new.id, 'Reserva archivada o revertida.');
    end if;
    return new;
  end if;

  if new.status = 'Confirmada' then
    resolved_amount := coalesce(new.payment_amount, 0);
    resolved_method := coalesce(nullif(trim(coalesce(new.payment_method, '')), ''), 'qr');

    if resolved_amount > 0 then
      movement_id := public.ensure_cash_income_movement(
        'appointment_reservations',
        new.id,
        resolved_amount,
        resolved_method,
        new.city,
        null,
        'cita',
        concat('Cita confirmada: ', coalesce(new.appointment_type, 'Consulta')),
        coalesce(new.title, new.appointment_type, 'Reserva'),
        new.admin_notes,
        jsonb_build_object('appointment_date', new.appointment_date, 'status', new.status)
      );

      update public.appointment_reservations
      set
        payment_method = resolved_method,
        cash_movement_id = movement_id,
        cash_recorded_at = coalesce(cash_recorded_at, now()),
        payment_verified_at = coalesce(payment_verified_at, now())
      where id = new.id;
    end if;
  elsif tg_op = 'update'
    and old.status = 'Confirmada'
    and new.status <> 'Confirmada'
    and new.cash_movement_id is not null then
    perform public.cancel_cash_movement_for_source('appointment_reservations', new.id, 'Reserva retirada del estado confirmada.');
  end if;

  return new;
end;
$$;

drop trigger if exists sync_appointment_reservation_cash on public.appointment_reservations;
create trigger sync_appointment_reservation_cash
after insert or update on public.appointment_reservations
for each row
execute function public.sync_appointment_reservation_cash();

create or replace function public.sync_appointment_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  movement_id uuid;
  resolved_amount numeric(12,2);
  resolved_method text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.is_deleted then
    if new.cash_movement_id is not null then
      perform public.cancel_cash_movement_for_source('appointments', new.id, 'Cita archivada o revertida.');
    end if;
    return new;
  end if;

  if new.payment_status = 'Pagado' and new.status <> 'Cancelada' then
    resolved_amount := coalesce(new.payment_amount, 0);
    resolved_method := coalesce(nullif(trim(coalesce(new.payment_method, '')), ''), 'efectivo');

    if resolved_amount > 0 then
      movement_id := public.ensure_cash_income_movement(
        'appointments',
        new.id,
        resolved_amount,
        resolved_method,
        new.city,
        null,
        'cita-manual',
        concat('Cita manual cobrada: ', coalesce(new.title, 'Cita')),
        coalesce(new.title, 'Cita'),
        new.notes,
        jsonb_build_object('appointment_date', new.appointment_date, 'status', new.status)
      );

      update public.appointments
      set
        payment_method = resolved_method,
        cash_movement_id = movement_id,
        cash_recorded_at = coalesce(cash_recorded_at, now())
      where id = new.id;
    end if;
  elsif tg_op = 'update'
    and (
      (old.payment_status = 'Pagado' and new.payment_status <> 'Pagado')
      or (old.status <> 'Cancelada' and new.status = 'Cancelada')
    )
    and new.cash_movement_id is not null then
    perform public.cancel_cash_movement_for_source('appointments', new.id, 'Cita manual retirada o cancelada.');
  end if;

  return new;
end;
$$;

drop trigger if exists sync_appointment_cash on public.appointments;
create trigger sync_appointment_cash
after insert or update on public.appointments
for each row
execute function public.sync_appointment_cash();

alter table public.cash_drawers enable row level security;
alter table public.cash_payment_methods enable row level security;
alter table public.cash_denominations enable row level security;
alter table public.cash_session_counts enable row level security;
alter table public.cash_session_count_lines enable row level security;

drop policy if exists "Admin staff manage cash drawers" on public.cash_drawers;
create policy "Admin staff manage cash drawers"
on public.cash_drawers
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Admin staff manage cash payment methods" on public.cash_payment_methods;
create policy "Admin staff manage cash payment methods"
on public.cash_payment_methods
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Admin staff manage cash denominations" on public.cash_denominations;
create policy "Admin staff manage cash denominations"
on public.cash_denominations
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Admin staff manage cash session counts" on public.cash_session_counts;
create policy "Admin staff manage cash session counts"
on public.cash_session_counts
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Admin staff manage cash session count lines" on public.cash_session_count_lines;
create policy "Admin staff manage cash session count lines"
on public.cash_session_count_lines
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

grant select, insert, update, delete on public.cash_drawers to authenticated;
grant select, insert, update, delete on public.cash_payment_methods to authenticated;
grant select, insert, update, delete on public.cash_denominations to authenticated;
grant select, insert, update, delete on public.cash_session_counts to authenticated;
grant select, insert, update, delete on public.cash_session_count_lines to authenticated;
grant execute on function public.find_open_cash_session(text, uuid) to authenticated;
grant execute on function public.ensure_cash_income_movement(text, uuid, numeric, text, text, uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.cancel_cash_movement_for_source(text, uuid, text) to authenticated;
grant execute on function public.record_cash_session_count(uuid, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
