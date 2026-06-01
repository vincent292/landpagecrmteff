create table if not exists public.savings_cards (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  treatment_id uuid references public.treatments(id) on delete set null,
  treatment_title text,
  patient_full_name text not null,
  patient_document_number text,
  token text not null unique,
  months_count int not null,
  monthly_amount numeric(12,2) not null,
  total_amount numeric(12,2) not null,
  approved_amount numeric(12,2) not null default 0,
  pending_amount numeric(12,2) not null default 0,
  approved_installments_count int not null default 0,
  observed_receipts_count int not null default 0,
  start_month date not null,
  status text not null default 'Activa',
  notes text,
  activation_message text,
  activated_at timestamptz,
  activated_by_profile_id uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  redeemed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_cards_months_positive check (months_count > 0 and months_count <= 60),
  constraint savings_cards_monthly_amount_positive check (monthly_amount > 0),
  constraint savings_cards_total_amount_positive check (total_amount > 0),
  constraint savings_cards_status_check check (status in ('Activa', 'Completada', 'Canjeada', 'Cancelada'))
);

create index if not exists savings_cards_patient_idx on public.savings_cards(patient_id, created_at desc);
create index if not exists savings_cards_token_idx on public.savings_cards(token);
create index if not exists savings_cards_status_idx on public.savings_cards(status, created_at desc);

drop trigger if exists savings_cards_touch_updated_at on public.savings_cards;
create trigger savings_cards_touch_updated_at
before update on public.savings_cards
for each row execute function public.set_row_updated_at();

create table if not exists public.savings_card_installments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.savings_cards(id) on delete restrict,
  installment_number int not null,
  due_date date not null,
  amount numeric(12,2) not null,
  status text not null default 'Pendiente',
  latest_receipt_id uuid,
  latest_submission_at timestamptz,
  latest_reviewed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  payment_method text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_card_installments_number_positive check (installment_number > 0),
  constraint savings_card_installments_amount_positive check (amount > 0),
  constraint savings_card_installments_status_check check (status in ('Pendiente', 'Comprobante enviado', 'En revision', 'Pagado', 'Observado')),
  constraint savings_card_installments_unique unique (card_id, installment_number)
);

create index if not exists savings_card_installments_card_idx on public.savings_card_installments(card_id, installment_number);
create index if not exists savings_card_installments_status_idx on public.savings_card_installments(status, due_date);

drop trigger if exists savings_card_installments_touch_updated_at on public.savings_card_installments;
create trigger savings_card_installments_touch_updated_at
before update on public.savings_card_installments
for each row execute function public.set_row_updated_at();

create table if not exists public.savings_card_receipts (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.savings_card_installments(id) on delete restrict,
  receipt_path text not null,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  status text not null default 'Comprobante enviado',
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  payment_method text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_card_receipts_status_check check (status in ('Comprobante enviado', 'En revision', 'Aprobado', 'Observado'))
);

create index if not exists savings_card_receipts_installment_idx on public.savings_card_receipts(installment_id, submitted_at desc);
create index if not exists savings_card_receipts_status_idx on public.savings_card_receipts(status, submitted_at desc);

drop trigger if exists savings_card_receipts_touch_updated_at on public.savings_card_receipts;
create trigger savings_card_receipts_touch_updated_at
before update on public.savings_card_receipts
for each row execute function public.set_row_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'savings_card_installments_latest_receipt_fk'
  ) then
    alter table public.savings_card_installments
      add constraint savings_card_installments_latest_receipt_fk
      foreign key (latest_receipt_id)
      references public.savings_card_receipts(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.savings_card_redemptions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.savings_cards(id) on delete restrict,
  treatment_id uuid references public.treatments(id) on delete set null,
  treatment_title text not null,
  treatment_price numeric(12,2) not null,
  savings_amount_used numeric(12,2) not null,
  extra_amount_paid numeric(12,2) not null default 0,
  payment_method text,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  notes text,
  redeemed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_card_redemptions_treatment_price_positive check (treatment_price > 0),
  constraint savings_card_redemptions_savings_positive check (savings_amount_used >= 0),
  constraint savings_card_redemptions_extra_positive check (extra_amount_paid >= 0),
  constraint savings_card_redemptions_card_unique unique (card_id)
);

create index if not exists savings_card_redemptions_card_idx on public.savings_card_redemptions(card_id, created_at desc);

drop trigger if exists savings_card_redemptions_touch_updated_at on public.savings_card_redemptions;
create trigger savings_card_redemptions_touch_updated_at
before update on public.savings_card_redemptions
for each row execute function public.set_row_updated_at();

alter table public.savings_cards enable row level security;
alter table public.savings_card_installments enable row level security;
alter table public.savings_card_receipts enable row level security;
alter table public.savings_card_redemptions enable row level security;

drop policy if exists "Staff manage savings cards" on public.savings_cards;
create policy "Staff manage savings cards" on public.savings_cards
for all using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Patients read activated savings cards" on public.savings_cards;
create policy "Patients read activated savings cards" on public.savings_cards
for select using (
  exists (
    select 1
    from public.patients
    where patients.id = savings_cards.patient_id
      and patients.profile_id = auth.uid()
      and savings_cards.activated_at is not null
      and coalesce(savings_cards.status, '') <> 'Cancelada'
  )
);

drop policy if exists "Staff manage savings card installments" on public.savings_card_installments;
create policy "Staff manage savings card installments" on public.savings_card_installments
for all using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Patients read own savings card installments" on public.savings_card_installments;
create policy "Patients read own savings card installments" on public.savings_card_installments
for select using (
  exists (
    select 1
    from public.savings_cards cards
    join public.patients on patients.id = cards.patient_id
    where cards.id = savings_card_installments.card_id
      and patients.profile_id = auth.uid()
      and cards.activated_at is not null
      and coalesce(cards.status, '') <> 'Cancelada'
  )
);

drop policy if exists "Staff manage savings card receipts" on public.savings_card_receipts;
create policy "Staff manage savings card receipts" on public.savings_card_receipts
for all using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Patients read own savings card receipts" on public.savings_card_receipts;
create policy "Patients read own savings card receipts" on public.savings_card_receipts
for select using (
  exists (
    select 1
    from public.savings_card_installments installments
    join public.savings_cards cards on cards.id = installments.card_id
    join public.patients on patients.id = cards.patient_id
    where installments.id = savings_card_receipts.installment_id
      and patients.profile_id = auth.uid()
      and cards.activated_at is not null
      and coalesce(cards.status, '') <> 'Cancelada'
  )
);

drop policy if exists "Staff manage savings card redemptions" on public.savings_card_redemptions;
create policy "Staff manage savings card redemptions" on public.savings_card_redemptions
for all using (public.is_admin_staff())
with check (public.is_admin_staff());

drop policy if exists "Patients read own savings card redemptions" on public.savings_card_redemptions;
create policy "Patients read own savings card redemptions" on public.savings_card_redemptions
for select using (
  exists (
    select 1
    from public.savings_cards cards
    join public.patients on patients.id = cards.patient_id
    where cards.id = savings_card_redemptions.card_id
      and patients.profile_id = auth.uid()
      and cards.activated_at is not null
  )
);

create or replace function public.generate_savings_card_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'AHR-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));

    exit when not exists (
      select 1
      from public.savings_cards
      where token = candidate
    );
  end loop;

  return candidate;
end;
$$;

create or replace function public.refresh_savings_card_progress(p_card_id uuid)
returns public.savings_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.savings_cards%rowtype;
  approved_count int := 0;
  observed_count int := 0;
  approved_amount_total numeric(12,2) := 0;
  pending_amount_total numeric(12,2) := 0;
begin
  select *
  into card_row
  from public.savings_cards
  where id = p_card_id
  for update;

  if card_row.id is null then
    raise exception 'No encontramos la tarjeta de ahorro.';
  end if;

  select
    count(*) filter (where status = 'Pagado'),
    count(*) filter (where status = 'Observado'),
    coalesce(sum(case when status = 'Pagado' then amount else 0 end), 0),
    greatest(card_row.total_amount - coalesce(sum(case when status = 'Pagado' then amount else 0 end), 0), 0)
  into approved_count, observed_count, approved_amount_total, pending_amount_total
  from public.savings_card_installments
  where card_id = card_row.id;

  update public.savings_cards
  set
    approved_installments_count = approved_count,
    observed_receipts_count = observed_count,
    approved_amount = approved_amount_total,
    pending_amount = pending_amount_total,
    status = case
      when status = 'Canjeada' then 'Canjeada'
      when status = 'Cancelada' then 'Cancelada'
      when approved_count >= months_count then 'Completada'
      else 'Activa'
    end,
    completed_at = case
      when status = 'Canjeada' then completed_at
      when approved_count >= months_count then coalesce(completed_at, now())
      else null
    end
  where id = card_row.id
  returning *
  into card_row;

  return card_row;
end;
$$;

create or replace function public.create_savings_card(
  p_patient_id uuid,
  p_months_count int,
  p_monthly_amount numeric,
  p_start_month date,
  p_treatment_id uuid default null,
  p_treatment_title text default null,
  p_notes text default null
)
returns public.savings_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  patient_row public.patients%rowtype;
  card_row public.savings_cards%rowtype;
  resolved_treatment_title text;
  first_month date;
  installment_date date;
  installment_number int;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'Solo administracion puede crear tarjetas de ahorro.';
  end if;

  if p_months_count is null or p_months_count <= 0 or p_months_count > 60 then
    raise exception 'Debes indicar una cantidad de meses valida.';
  end if;

  if p_monthly_amount is null or p_monthly_amount <= 0 then
    raise exception 'Debes indicar un monto mensual valido.';
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

  resolved_treatment_title := nullif(trim(coalesce(p_treatment_title, '')), '');

  if p_treatment_id is not null then
    select coalesce(nullif(trim(title), ''), resolved_treatment_title)
    into resolved_treatment_title
    from public.treatments
    where id = p_treatment_id;
  end if;

  first_month := date_trunc('month', coalesce(p_start_month, current_date))::date;

  insert into public.savings_cards (
    patient_id,
    treatment_id,
    treatment_title,
    patient_full_name,
    patient_document_number,
    token,
    months_count,
    monthly_amount,
    total_amount,
    approved_amount,
    pending_amount,
    start_month,
    status,
    notes,
    created_by,
    updated_by
  )
  values (
    patient_row.id,
    p_treatment_id,
    resolved_treatment_title,
    patient_row.full_name,
    public.normalize_document_number(patient_row.document_number),
    public.generate_savings_card_token(),
    p_months_count,
    round(p_monthly_amount::numeric, 2),
    round((p_monthly_amount * p_months_count)::numeric, 2),
    0,
    round((p_monthly_amount * p_months_count)::numeric, 2),
    first_month,
    'Activa',
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    auth.uid()
  )
  returning *
  into card_row;

  for installment_number in 1..p_months_count loop
    installment_date := (first_month + make_interval(months => installment_number - 1))::date;

    insert into public.savings_card_installments (
      card_id,
      installment_number,
      due_date,
      amount,
      status
    )
    values (
      card_row.id,
      installment_number,
      installment_date,
      round(p_monthly_amount::numeric, 2),
      'Pendiente'
    );
  end loop;

  return public.refresh_savings_card_progress(card_row.id);
end;
$$;

create or replace function public.activate_savings_card_token(p_token text)
returns public.savings_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile_row public.profiles%rowtype;
  patient_row public.patients%rowtype;
  card_row public.savings_cards%rowtype;
  normalized_profile_document text;
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesion para activar tu tarjeta.';
  end if;

  select *
  into profile_row
  from public.profiles
  where id = current_user_id;

  normalized_profile_document := public.normalize_document_number(profile_row.document_number);

  if normalized_profile_document is null then
    raise exception 'Completa primero tu numero de carnet en tu perfil.';
  end if;

  select *
  into card_row
  from public.savings_cards
  where token = upper(trim(coalesce(p_token, '')))
  for update;

  if card_row.id is null then
    raise exception 'No encontramos esa tarjeta o el token es invalido.';
  end if;

  if card_row.status = 'Cancelada' then
    raise exception 'Esta tarjeta fue cancelada y ya no se puede activar.';
  end if;

  select *
  into patient_row
  from public.patients
  where id = card_row.patient_id
    and coalesce(is_deleted, false) = false
  for update;

  if patient_row.id is null then
    raise exception 'La tarjeta ya no tiene un paciente valido asignado.';
  end if;

  if public.normalize_document_number(patient_row.document_number) is distinct from normalized_profile_document then
    raise exception 'Este token solo funciona en la cuenta del paciente asignado por carnet.';
  end if;

  if patient_row.profile_id is not null and patient_row.profile_id <> current_user_id then
    raise exception 'Ese carnet ya esta vinculado a otra cuenta.';
  end if;

  if patient_row.profile_id is null then
    update public.patients
    set profile_id = current_user_id
    where id = patient_row.id;
  end if;

  if card_row.activated_by_profile_id is not null and card_row.activated_by_profile_id <> current_user_id then
    raise exception 'La tarjeta ya fue activada por otra cuenta.';
  end if;

  update public.savings_cards
  set
    activated_at = coalesce(activated_at, now()),
    activated_by_profile_id = current_user_id,
    updated_by = current_user_id
  where id = card_row.id
  returning *
  into card_row;

  return public.refresh_savings_card_progress(card_row.id);
end;
$$;

create or replace function public.submit_savings_card_installment_receipt(
  p_installment_id uuid,
  p_receipt_path text
)
returns public.savings_card_installments
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  installment_row public.savings_card_installments%rowtype;
  card_row public.savings_cards%rowtype;
  patient_row public.patients%rowtype;
  receipt_row public.savings_card_receipts%rowtype;
  trimmed_receipt_path text := nullif(trim(coalesce(p_receipt_path, '')), '');
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesion para subir el comprobante.';
  end if;

  if trimmed_receipt_path is null then
    raise exception 'Debes subir un comprobante valido.';
  end if;

  select *
  into installment_row
  from public.savings_card_installments
  where id = p_installment_id
  for update;

  if installment_row.id is null then
    raise exception 'No encontramos esa cuota.';
  end if;

  select *
  into card_row
  from public.savings_cards
  where id = installment_row.card_id
  for update;

  if card_row.id is null then
    raise exception 'No encontramos la tarjeta de ahorro asociada.';
  end if;

  if card_row.status in ('Cancelada', 'Canjeada') then
    raise exception 'Esta tarjeta ya no acepta nuevos comprobantes.';
  end if;

  if card_row.activated_at is null then
    raise exception 'Primero debes activar la tarjeta con tu token.';
  end if;

  select *
  into patient_row
  from public.patients
  where id = card_row.patient_id
    and profile_id = current_user_id
    and coalesce(is_deleted, false) = false
  limit 1;

  if patient_row.id is null then
    raise exception 'Esta cuota no pertenece a tu cuenta.';
  end if;

  if installment_row.status not in ('Pendiente', 'Observado') then
    raise exception 'Esta cuota ya tiene un comprobante en proceso o ya fue pagada.';
  end if;

  insert into public.savings_card_receipts (
    installment_id,
    receipt_path,
    submitted_by,
    status
  )
  values (
    installment_row.id,
    trimmed_receipt_path,
    current_user_id,
    'Comprobante enviado'
  )
  returning *
  into receipt_row;

  update public.savings_card_installments
  set
    latest_receipt_id = receipt_row.id,
    latest_submission_at = receipt_row.submitted_at,
    latest_reviewed_at = null,
    approved_at = null,
    approved_by = null,
    payment_method = null,
    admin_notes = null,
    status = 'Comprobante enviado'
  where id = installment_row.id
  returning *
  into installment_row;

  perform public.refresh_savings_card_progress(card_row.id);
  return installment_row;
end;
$$;

create or replace function public.review_savings_card_receipt(
  p_receipt_id uuid,
  p_action text,
  p_admin_notes text default null,
  p_payment_method text default null
)
returns public.savings_card_installments
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt_row public.savings_card_receipts%rowtype;
  installment_row public.savings_card_installments%rowtype;
  card_row public.savings_cards%rowtype;
  patient_row public.patients%rowtype;
  movement_id uuid;
  action_value text := lower(trim(coalesce(p_action, '')));
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'Solo administracion puede revisar comprobantes de ahorro.';
  end if;

  if action_value not in ('review', 'approve', 'observe') then
    raise exception 'Accion no valida para revisar comprobantes.';
  end if;

  select *
  into receipt_row
  from public.savings_card_receipts
  where id = p_receipt_id
  for update;

  if receipt_row.id is null then
    raise exception 'No encontramos ese comprobante.';
  end if;

  select *
  into installment_row
  from public.savings_card_installments
  where id = receipt_row.installment_id
  for update;

  select *
  into card_row
  from public.savings_cards
  where id = installment_row.card_id
  for update;

  select *
  into patient_row
  from public.patients
  where id = card_row.patient_id
    and coalesce(is_deleted, false) = false
  limit 1;

  if installment_row.status = 'Pagado' and action_value <> 'approve' then
    raise exception 'Esta cuota ya fue aprobada y no puede volver a observarse.';
  end if;

  if installment_row.latest_receipt_id is distinct from receipt_row.id then
    raise exception 'Solo puedes revisar el comprobante mas reciente de esta cuota.';
  end if;

  if action_value = 'review' then
    update public.savings_card_receipts
    set
      status = 'En revision',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      admin_notes = nullif(trim(coalesce(p_admin_notes, '')), '')
    where id = receipt_row.id
    returning *
    into receipt_row;

    update public.savings_card_installments
    set
      status = 'En revision',
      latest_reviewed_at = now(),
      admin_notes = nullif(trim(coalesce(p_admin_notes, '')), '')
    where id = installment_row.id
    returning *
    into installment_row;
  elsif action_value = 'observe' then
    update public.savings_card_receipts
    set
      status = 'Observado',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      admin_notes = coalesce(nullif(trim(coalesce(p_admin_notes, '')), ''), 'Comprobante observado por administracion.')
    where id = receipt_row.id
    returning *
    into receipt_row;

    update public.savings_card_installments
    set
      status = 'Observado',
      latest_reviewed_at = now(),
      admin_notes = receipt_row.admin_notes
    where id = installment_row.id
    returning *
    into installment_row;
  else
    if coalesce(nullif(trim(coalesce(p_payment_method, '')), ''), '') = '' then
      raise exception 'Debes indicar el metodo de pago para aprobar la cuota.';
    end if;

    movement_id := public.ensure_cash_income_movement(
      'savings_card_installments',
      installment_row.id,
      installment_row.amount,
      p_payment_method,
      patient_row.city,
      null,
      'tarjetas_ahorro',
      'Cuota aprobada de tarjeta de ahorro',
      card_row.patient_full_name,
      p_admin_notes,
      jsonb_build_object(
        'card_id', card_row.id,
        'receipt_id', receipt_row.id,
        'installment_number', installment_row.installment_number,
        'due_date', installment_row.due_date,
        'treatment_title', card_row.treatment_title
      )
    );

    update public.savings_card_receipts
    set
      status = 'Aprobado',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      payment_method = p_payment_method,
      admin_notes = nullif(trim(coalesce(p_admin_notes, '')), '')
    where id = receipt_row.id
    returning *
    into receipt_row;

    update public.savings_card_installments
    set
      status = 'Pagado',
      latest_reviewed_at = now(),
      approved_at = now(),
      approved_by = auth.uid(),
      cash_movement_id = movement_id,
      payment_method = p_payment_method,
      admin_notes = nullif(trim(coalesce(p_admin_notes, '')), '')
    where id = installment_row.id
    returning *
    into installment_row;
  end if;

  perform public.refresh_savings_card_progress(card_row.id);
  return installment_row;
end;
$$;

create or replace function public.redeem_savings_card(
  p_token text,
  p_treatment_title text,
  p_treatment_price numeric,
  p_extra_amount_paid numeric default 0,
  p_payment_method text default null,
  p_notes text default null,
  p_treatment_id uuid default null
)
returns public.savings_card_redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.savings_cards%rowtype;
  redemption_row public.savings_card_redemptions%rowtype;
  approved_total numeric(12,2);
  expected_extra numeric(12,2);
  movement_id uuid;
  treatment_title_value text;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'Solo administracion puede canjear tarjetas de ahorro.';
  end if;

  if p_treatment_price is null or p_treatment_price <= 0 then
    raise exception 'Debes indicar el precio total del tratamiento.';
  end if;

  select *
  into card_row
  from public.savings_cards
  where token = upper(trim(coalesce(p_token, '')))
  for update;

  if card_row.id is null then
    raise exception 'No encontramos la tarjeta o el token es invalido.';
  end if;

  if card_row.status = 'Canjeada' then
    raise exception 'Esta tarjeta ya fue canjeada.';
  end if;

  if card_row.status <> 'Completada' then
    raise exception 'La tarjeta aun no esta lista para canje. Todos los meses deben estar aprobados.';
  end if;

  if card_row.approved_installments_count <> card_row.months_count then
    raise exception 'La tarjeta aun tiene cuotas pendientes o en observacion.';
  end if;

  approved_total := coalesce(card_row.approved_amount, 0);
  expected_extra := greatest(round((p_treatment_price - approved_total)::numeric, 2), 0);

  if round(coalesce(p_extra_amount_paid, 0)::numeric, 2) <> expected_extra then
    raise exception 'El monto extra debe coincidir exactamente con la diferencia restante del tratamiento.';
  end if;

  if expected_extra > 0 and coalesce(nullif(trim(coalesce(p_payment_method, '')), ''), '') = '' then
    raise exception 'Debes indicar el metodo de pago para la diferencia restante.';
  end if;

  treatment_title_value := coalesce(
    nullif(trim(coalesce(p_treatment_title, '')), ''),
    nullif(trim(coalesce(card_row.treatment_title, '')), ''),
    'Tratamiento'
  );

  insert into public.savings_card_redemptions (
    card_id,
    treatment_id,
    treatment_title,
    treatment_price,
    savings_amount_used,
    extra_amount_paid,
    payment_method,
    notes,
    redeemed_by
  )
  values (
    card_row.id,
    p_treatment_id,
    treatment_title_value,
    round(p_treatment_price::numeric, 2),
    approved_total,
    expected_extra,
    nullif(trim(coalesce(p_payment_method, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning *
  into redemption_row;

  if expected_extra > 0 then
    movement_id := public.ensure_cash_income_movement(
      'savings_card_redemptions',
      redemption_row.id,
      expected_extra,
      p_payment_method,
      null,
      null,
      'tarjetas_ahorro',
      'Diferencia pagada al canjear tarjeta de ahorro',
      card_row.patient_full_name,
      p_notes,
      jsonb_build_object(
        'card_id', card_row.id,
        'treatment_title', treatment_title_value,
        'approved_amount', approved_total,
        'treatment_price', p_treatment_price
      )
    );

    update public.savings_card_redemptions
    set cash_movement_id = movement_id
    where id = redemption_row.id
    returning *
    into redemption_row;
  end if;

  update public.savings_cards
  set
    status = 'Canjeada',
    redeemed_at = now(),
    updated_by = auth.uid()
  where id = card_row.id;

  return redemption_row;
end;
$$;

grant execute on function public.generate_savings_card_token() to authenticated;
grant execute on function public.refresh_savings_card_progress(uuid) to authenticated;
grant execute on function public.create_savings_card(uuid, int, numeric, date, uuid, text, text) to authenticated;
grant execute on function public.activate_savings_card_token(text) to authenticated;
grant execute on function public.submit_savings_card_installment_receipt(uuid, text) to authenticated;
grant execute on function public.review_savings_card_receipt(uuid, text, text, text) to authenticated;
grant execute on function public.redeem_savings_card(text, text, numeric, numeric, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
