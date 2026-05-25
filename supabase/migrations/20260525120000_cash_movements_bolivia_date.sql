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
  bolivia_today date := (timezone('America/La_Paz', now()))::date;
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
    bolivia_today,
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

update public.cash_movements
set movement_date = (timezone('America/La_Paz', approved_at))::date
where auto_created = true
  and approved_at is not null
  and movement_date is distinct from (timezone('America/La_Paz', approved_at))::date;

notify pgrst, 'reload schema';
