create table if not exists public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  treatment_id uuid references public.treatments(id) on delete set null,
  title text not null,
  treatment_title text,
  patient_full_name text not null,
  patient_document_number text,
  total_amount numeric(12,2) not null,
  initial_payment_amount numeric(12,2) not null default 0,
  financed_amount numeric(12,2) not null,
  installment_amount numeric(12,2) not null,
  months_count int not null,
  approved_amount numeric(12,2) not null default 0,
  pending_amount numeric(12,2) not null default 0,
  approved_installments_count int not null default 0,
  observed_receipts_count int not null default 0,
  first_due_date date not null,
  allow_treatment_before_completion boolean not null default false,
  initial_payment_date date,
  initial_payment_method text,
  initial_payment_cash_movement_id uuid references public.cash_movements(id) on delete set null,
  status text not null default 'Activo',
  notes text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_plans_title_required check (char_length(trim(title)) > 0),
  constraint payment_plans_total_positive check (total_amount > 0),
  constraint payment_plans_initial_non_negative check (initial_payment_amount >= 0),
  constraint payment_plans_financed_positive check (financed_amount > 0),
  constraint payment_plans_installment_positive check (installment_amount > 0),
  constraint payment_plans_months_positive check (months_count > 0 and months_count <= 60),
  constraint payment_plans_status_check check (status in ('Activo', 'Al dia', 'Con atraso', 'Liquidado', 'Cancelado'))
);

create index if not exists payment_plans_patient_idx on public.payment_plans(patient_id, created_at desc);
create index if not exists payment_plans_status_idx on public.payment_plans(status, created_at desc);
create index if not exists payment_plans_treatment_idx on public.payment_plans(treatment_id, created_at desc);

drop trigger if exists payment_plans_touch_updated_at on public.payment_plans;
create trigger payment_plans_touch_updated_at
before update on public.payment_plans
for each row execute function public.set_row_updated_at();

create table if not exists public.payment_plan_installments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.payment_plans(id) on delete restrict,
  installment_number int not null,
  due_date date not null,
  amount numeric(12,2) not null,
  status text not null default 'Pendiente',
  latest_receipt_id uuid,
  latest_submission_at timestamptz,
  latest_reviewed_at timestamptz,
  latest_payment_date date,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  payment_method text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_plan_installments_number_positive check (installment_number > 0),
  constraint payment_plan_installments_amount_positive check (amount > 0),
  constraint payment_plan_installments_status_check check (status in ('Pendiente', 'Comprobante enviado', 'En revision', 'Pagado', 'Observado')),
  constraint payment_plan_installments_unique unique (plan_id, installment_number)
);

create index if not exists payment_plan_installments_plan_idx on public.payment_plan_installments(plan_id, installment_number);
create index if not exists payment_plan_installments_status_idx on public.payment_plan_installments(status, due_date);

drop trigger if exists payment_plan_installments_touch_updated_at on public.payment_plan_installments;
create trigger payment_plan_installments_touch_updated_at
before update on public.payment_plan_installments
for each row execute function public.set_row_updated_at();

create table if not exists public.payment_plan_receipts (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.payment_plan_installments(id) on delete restrict,
  receipt_path text not null,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  payment_date date not null,
  status text not null default 'Comprobante enviado',
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  payment_method text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_plan_receipts_status_check check (status in ('Comprobante enviado', 'En revision', 'Aprobado', 'Observado'))
);

create index if not exists payment_plan_receipts_installment_idx on public.payment_plan_receipts(installment_id, submitted_at desc);
create index if not exists payment_plan_receipts_status_idx on public.payment_plan_receipts(status, submitted_at desc);

drop trigger if exists payment_plan_receipts_touch_updated_at on public.payment_plan_receipts;
create trigger payment_plan_receipts_touch_updated_at
before update on public.payment_plan_receipts
for each row execute function public.set_row_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_plan_installments_latest_receipt_fk'
  ) then
    alter table public.payment_plan_installments
      add constraint payment_plan_installments_latest_receipt_fk
      foreign key (latest_receipt_id)
      references public.payment_plan_receipts(id)
      on delete set null;
  end if;
end $$;

alter table public.payment_plans enable row level security;
alter table public.payment_plan_installments enable row level security;
alter table public.payment_plan_receipts enable row level security;

drop policy if exists "Staff manage payment plans" on public.payment_plans;
create policy "Staff manage payment plans" on public.payment_plans
for all using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Patients read own payment plans" on public.payment_plans;
create policy "Patients read own payment plans" on public.payment_plans
for select using (
  exists (
    select 1
    from public.patients
    where patients.id = payment_plans.patient_id
      and patients.profile_id = auth.uid()
      and coalesce(patients.is_deleted, false) = false
  )
);

drop policy if exists "Staff manage payment plan installments" on public.payment_plan_installments;
create policy "Staff manage payment plan installments" on public.payment_plan_installments
for all using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Patients read own payment plan installments" on public.payment_plan_installments;
create policy "Patients read own payment plan installments" on public.payment_plan_installments
for select using (
  exists (
    select 1
    from public.payment_plans plans
    join public.patients on patients.id = plans.patient_id
    where plans.id = payment_plan_installments.plan_id
      and patients.profile_id = auth.uid()
      and coalesce(patients.is_deleted, false) = false
  )
);

drop policy if exists "Staff manage payment plan receipts" on public.payment_plan_receipts;
create policy "Staff manage payment plan receipts" on public.payment_plan_receipts
for all using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Patients read own payment plan receipts" on public.payment_plan_receipts;
create policy "Patients read own payment plan receipts" on public.payment_plan_receipts
for select using (
  exists (
    select 1
    from public.payment_plan_installments installments
    join public.payment_plans plans on plans.id = installments.plan_id
    join public.patients on patients.id = plans.patient_id
    where installments.id = payment_plan_receipts.installment_id
      and patients.profile_id = auth.uid()
      and coalesce(patients.is_deleted, false) = false
  )
);

create or replace function public.ensure_cash_income_movement_on_date(
  p_source_table text,
  p_source_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_movement_date date,
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
  resolved_movement_date date := coalesce(p_movement_date, (timezone('America/La_Paz', now()))::date);
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
    update public.cash_movements
    set
      movement_date = resolved_movement_date,
      payment_method = coalesce(nullif(trim(coalesce(p_payment_method, '')), ''), payment_method),
      city = coalesce(nullif(trim(coalesce(p_city, '')), ''), city),
      drawer_id = coalesce(p_drawer_id, drawer_id),
      notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
      metadata = coalesce(p_metadata, metadata),
      approved_at = now(),
      approved_by = auth.uid()
    where id = existing_movement_id;

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
    resolved_movement_date,
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

create or replace function public.refresh_payment_plan_progress(p_plan_id uuid)
returns public.payment_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_row public.payment_plans%rowtype;
  approved_count int := 0;
  observed_count int := 0;
  overdue_count int := 0;
  approved_installment_amount numeric(12,2) := 0;
  next_approved_amount numeric(12,2) := 0;
  next_pending_amount numeric(12,2) := 0;
  bolivia_today date := (timezone('America/La_Paz', now()))::date;
begin
  select *
  into plan_row
  from public.payment_plans
  where id = p_plan_id
  for update;

  if plan_row.id is null then
    raise exception 'No encontramos el plan de pagos.';
  end if;

  select
    count(*) filter (where status = 'Pagado'),
    count(*) filter (where status = 'Observado'),
    count(*) filter (where status <> 'Pagado' and due_date < bolivia_today),
    coalesce(sum(case when status = 'Pagado' then amount else 0 end), 0)
  into approved_count, observed_count, overdue_count, approved_installment_amount
  from public.payment_plan_installments
  where plan_id = plan_row.id;

  next_approved_amount := round(coalesce(plan_row.initial_payment_amount, 0) + approved_installment_amount, 2);
  next_pending_amount := greatest(round(plan_row.total_amount - next_approved_amount, 2), 0);

  update public.payment_plans
  set
    approved_installments_count = approved_count,
    observed_receipts_count = observed_count,
    approved_amount = next_approved_amount,
    pending_amount = next_pending_amount,
    status = case
      when status = 'Cancelado' then 'Cancelado'
      when next_pending_amount <= 0 then 'Liquidado'
      when overdue_count > 0 then 'Con atraso'
      when next_approved_amount > 0 then 'Al dia'
      else 'Activo'
    end,
    completed_at = case
      when status = 'Cancelado' then completed_at
      when next_pending_amount <= 0 then coalesce(completed_at, now())
      else null
    end
  where id = plan_row.id
  returning *
  into plan_row;

  return plan_row;
end;
$$;

create or replace function public.create_payment_plan(
  p_patient_id uuid,
  p_total_amount numeric,
  p_initial_payment_amount numeric,
  p_initial_payment_date date,
  p_initial_payment_method text,
  p_months_count int,
  p_installment_amount numeric,
  p_first_due_date date,
  p_allow_treatment_before_completion boolean default false,
  p_treatment_id uuid default null,
  p_title text default null,
  p_notes text default null
)
returns public.payment_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  patient_row public.patients%rowtype;
  plan_row public.payment_plans%rowtype;
  resolved_title text;
  resolved_treatment_title text;
  resolved_total_amount numeric(12,2) := round(coalesce(p_total_amount, 0)::numeric, 2);
  resolved_initial_amount numeric(12,2) := round(coalesce(p_initial_payment_amount, 0)::numeric, 2);
  resolved_installment_amount numeric(12,2) := round(coalesce(p_installment_amount, 0)::numeric, 2);
  resolved_financed_amount numeric(12,2);
  resolved_sum_amount numeric(12,2);
  movement_id uuid;
  installment_date date;
  installment_number int;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'Solo administracion puede crear planes de pago.';
  end if;

  if resolved_total_amount <= 0 then
    raise exception 'Debes indicar un monto total valido.';
  end if;

  if resolved_initial_amount < 0 then
    raise exception 'El anticipo no puede ser negativo.';
  end if;

  if p_months_count is null or p_months_count <= 0 or p_months_count > 60 then
    raise exception 'Debes indicar una cantidad de cuotas valida.';
  end if;

  if resolved_installment_amount <= 0 then
    raise exception 'Debes indicar un monto valido por cuota.';
  end if;

  if p_first_due_date is null then
    raise exception 'Debes indicar la fecha de la primera cuota.';
  end if;

  resolved_financed_amount := round((resolved_installment_amount * p_months_count)::numeric, 2);
  resolved_sum_amount := round((resolved_initial_amount + resolved_financed_amount)::numeric, 2);

  if resolved_sum_amount <> resolved_total_amount then
    raise exception 'El total debe ser igual a anticipo mas cuotas.';
  end if;

  if resolved_initial_amount > 0 and p_initial_payment_date is null then
    raise exception 'Debes indicar la fecha del anticipo.';
  end if;

  if resolved_initial_amount > 0 and coalesce(nullif(trim(coalesce(p_initial_payment_method, '')), ''), '') = '' then
    raise exception 'Debes indicar el metodo de pago del anticipo.';
  end if;

  select *
  into patient_row
  from public.patients
  where id = p_patient_id
    and coalesce(is_deleted, false) = false
  limit 1;

  if patient_row.id is null then
    raise exception 'No encontramos al paciente seleccionado.';
  end if;

  resolved_title := nullif(trim(coalesce(p_title, '')), '');
  resolved_treatment_title := null;

  if p_treatment_id is not null then
    select nullif(trim(title), '')
    into resolved_treatment_title
    from public.treatments
    where id = p_treatment_id;
  end if;

  resolved_title := coalesce(resolved_title, resolved_treatment_title);

  if resolved_title is null then
    raise exception 'Debes indicar un tratamiento o un titulo libre para el plan.';
  end if;

  insert into public.payment_plans (
    patient_id,
    treatment_id,
    title,
    treatment_title,
    patient_full_name,
    patient_document_number,
    total_amount,
    initial_payment_amount,
    financed_amount,
    installment_amount,
    months_count,
    approved_amount,
    pending_amount,
    first_due_date,
    allow_treatment_before_completion,
    initial_payment_date,
    initial_payment_method,
    status,
    notes,
    created_by,
    updated_by
  )
  values (
    patient_row.id,
    p_treatment_id,
    resolved_title,
    resolved_treatment_title,
    patient_row.full_name,
    public.normalize_document_number(patient_row.document_number),
    resolved_total_amount,
    resolved_initial_amount,
    resolved_financed_amount,
    resolved_installment_amount,
    p_months_count,
    resolved_initial_amount,
    greatest(round((resolved_total_amount - resolved_initial_amount)::numeric, 2), 0),
    p_first_due_date,
    coalesce(p_allow_treatment_before_completion, false),
    p_initial_payment_date,
    nullif(trim(coalesce(p_initial_payment_method, '')), ''),
    'Activo',
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    auth.uid()
  )
  returning *
  into plan_row;

  if resolved_initial_amount > 0 then
    movement_id := public.ensure_cash_income_movement_on_date(
      'payment_plans',
      plan_row.id,
      resolved_initial_amount,
      p_initial_payment_method,
      p_initial_payment_date,
      patient_row.city,
      null,
      'planes_pago',
      'Anticipo inicial de plan de pagos',
      patient_row.full_name,
      p_notes,
      jsonb_build_object(
        'plan_id', plan_row.id,
        'title', resolved_title,
        'patient_id', patient_row.id,
        'type', 'initial_payment'
      )
    );

    update public.payment_plans
    set initial_payment_cash_movement_id = movement_id
    where id = plan_row.id
    returning *
    into plan_row;
  end if;

  for installment_number in 1..p_months_count loop
    installment_date := (p_first_due_date + make_interval(months => installment_number - 1))::date;

    insert into public.payment_plan_installments (
      plan_id,
      installment_number,
      due_date,
      amount,
      status
    )
    values (
      plan_row.id,
      installment_number,
      installment_date,
      resolved_installment_amount,
      'Pendiente'
    );
  end loop;

  return public.refresh_payment_plan_progress(plan_row.id);
end;
$$;

create or replace function public.submit_payment_plan_installment_receipt(
  p_installment_id uuid,
  p_receipt_path text,
  p_payment_date date
)
returns public.payment_plan_installments
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  installment_row public.payment_plan_installments%rowtype;
  plan_row public.payment_plans%rowtype;
  patient_row public.patients%rowtype;
  receipt_row public.payment_plan_receipts%rowtype;
  trimmed_receipt_path text := nullif(trim(coalesce(p_receipt_path, '')), '');
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesion para subir el comprobante.';
  end if;

  if trimmed_receipt_path is null then
    raise exception 'Debes subir un comprobante valido.';
  end if;

  if p_payment_date is null then
    raise exception 'Debes indicar la fecha del deposito.';
  end if;

  select *
  into installment_row
  from public.payment_plan_installments
  where id = p_installment_id
  for update;

  if installment_row.id is null then
    raise exception 'No encontramos esa cuota.';
  end if;

  select *
  into plan_row
  from public.payment_plans
  where id = installment_row.plan_id
  for update;

  if plan_row.id is null then
    raise exception 'No encontramos el plan de pagos asociado.';
  end if;

  if plan_row.status in ('Cancelado', 'Liquidado') then
    raise exception 'Este plan ya no acepta nuevos comprobantes.';
  end if;

  select *
  into patient_row
  from public.patients
  where id = plan_row.patient_id
    and profile_id = current_user_id
    and coalesce(is_deleted, false) = false
  limit 1;

  if patient_row.id is null then
    raise exception 'Esta cuota no pertenece a tu cuenta.';
  end if;

  if installment_row.status not in ('Pendiente', 'Observado') then
    raise exception 'Esta cuota ya tiene un comprobante en proceso o ya fue pagada.';
  end if;

  insert into public.payment_plan_receipts (
    installment_id,
    receipt_path,
    submitted_by,
    payment_date,
    status
  )
  values (
    installment_row.id,
    trimmed_receipt_path,
    current_user_id,
    p_payment_date,
    'Comprobante enviado'
  )
  returning *
  into receipt_row;

  update public.payment_plan_installments
  set
    latest_receipt_id = receipt_row.id,
    latest_submission_at = receipt_row.submitted_at,
    latest_reviewed_at = null,
    latest_payment_date = receipt_row.payment_date,
    approved_at = null,
    approved_by = null,
    payment_method = null,
    admin_notes = null,
    status = 'Comprobante enviado'
  where id = installment_row.id
  returning *
  into installment_row;

  perform public.refresh_payment_plan_progress(plan_row.id);
  return installment_row;
end;
$$;

create or replace function public.review_payment_plan_receipt(
  p_receipt_id uuid,
  p_action text,
  p_admin_notes text default null,
  p_payment_method text default null,
  p_payment_date date default null
)
returns public.payment_plan_installments
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt_row public.payment_plan_receipts%rowtype;
  installment_row public.payment_plan_installments%rowtype;
  plan_row public.payment_plans%rowtype;
  patient_row public.patients%rowtype;
  movement_id uuid;
  action_value text := lower(trim(coalesce(p_action, '')));
  resolved_payment_date date;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'Solo administracion puede revisar comprobantes del plan.';
  end if;

  if action_value not in ('review', 'approve', 'observe') then
    raise exception 'Accion no valida para revisar comprobantes.';
  end if;

  select *
  into receipt_row
  from public.payment_plan_receipts
  where id = p_receipt_id
  for update;

  if receipt_row.id is null then
    raise exception 'No encontramos ese comprobante.';
  end if;

  select *
  into installment_row
  from public.payment_plan_installments
  where id = receipt_row.installment_id
  for update;

  select *
  into plan_row
  from public.payment_plans
  where id = installment_row.plan_id
  for update;

  select *
  into patient_row
  from public.patients
  where id = plan_row.patient_id
    and coalesce(is_deleted, false) = false
  limit 1;

  if installment_row.status = 'Pagado' and action_value <> 'approve' then
    raise exception 'Esta cuota ya fue aprobada y no puede volver a observarse.';
  end if;

  if installment_row.latest_receipt_id is distinct from receipt_row.id then
    raise exception 'Solo puedes revisar el comprobante mas reciente de esta cuota.';
  end if;

  resolved_payment_date := coalesce(p_payment_date, receipt_row.payment_date);

  if action_value = 'review' then
    update public.payment_plan_receipts
    set
      status = 'En revision',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      payment_date = resolved_payment_date,
      admin_notes = nullif(trim(coalesce(p_admin_notes, '')), '')
    where id = receipt_row.id
    returning *
    into receipt_row;

    update public.payment_plan_installments
    set
      status = 'En revision',
      latest_reviewed_at = now(),
      latest_payment_date = resolved_payment_date,
      admin_notes = nullif(trim(coalesce(p_admin_notes, '')), '')
    where id = installment_row.id
    returning *
    into installment_row;
  elsif action_value = 'observe' then
    update public.payment_plan_receipts
    set
      status = 'Observado',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      payment_date = resolved_payment_date,
      admin_notes = coalesce(nullif(trim(coalesce(p_admin_notes, '')), ''), 'Comprobante observado por administracion.')
    where id = receipt_row.id
    returning *
    into receipt_row;

    update public.payment_plan_installments
    set
      status = 'Observado',
      latest_reviewed_at = now(),
      latest_payment_date = resolved_payment_date,
      admin_notes = receipt_row.admin_notes
    where id = installment_row.id
    returning *
    into installment_row;
  else
    if coalesce(nullif(trim(coalesce(p_payment_method, '')), ''), '') = '' then
      raise exception 'Debes indicar el metodo de pago para aprobar la cuota.';
    end if;

    if resolved_payment_date is null then
      raise exception 'Debes indicar la fecha del deposito para aprobar la cuota.';
    end if;

    movement_id := public.ensure_cash_income_movement_on_date(
      'payment_plan_installments',
      installment_row.id,
      installment_row.amount,
      p_payment_method,
      resolved_payment_date,
      patient_row.city,
      null,
      'planes_pago',
      'Cuota aprobada de plan de pagos',
      plan_row.patient_full_name,
      p_admin_notes,
      jsonb_build_object(
        'plan_id', plan_row.id,
        'receipt_id', receipt_row.id,
        'installment_number', installment_row.installment_number,
        'due_date', installment_row.due_date,
        'title', plan_row.title,
        'allow_treatment_before_completion', plan_row.allow_treatment_before_completion
      )
    );

    update public.payment_plan_receipts
    set
      status = 'Aprobado',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      payment_date = resolved_payment_date,
      payment_method = p_payment_method,
      admin_notes = nullif(trim(coalesce(p_admin_notes, '')), '')
    where id = receipt_row.id
    returning *
    into receipt_row;

    update public.payment_plan_installments
    set
      status = 'Pagado',
      latest_reviewed_at = now(),
      latest_payment_date = resolved_payment_date,
      approved_at = now(),
      approved_by = auth.uid(),
      cash_movement_id = movement_id,
      payment_method = p_payment_method,
      admin_notes = nullif(trim(coalesce(p_admin_notes, '')), '')
    where id = installment_row.id
    returning *
    into installment_row;
  end if;

  perform public.refresh_payment_plan_progress(plan_row.id);
  return installment_row;
end;
$$;

grant execute on function public.ensure_cash_income_movement_on_date(text, uuid, numeric, text, date, text, uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.refresh_payment_plan_progress(uuid) to authenticated;
grant execute on function public.create_payment_plan(uuid, numeric, numeric, date, text, int, numeric, date, boolean, uuid, text, text) to authenticated;
grant execute on function public.submit_payment_plan_installment_receipt(uuid, text, date) to authenticated;
grant execute on function public.review_payment_plan_receipt(uuid, text, text, text, date) to authenticated;

notify pgrst, 'reload schema';
