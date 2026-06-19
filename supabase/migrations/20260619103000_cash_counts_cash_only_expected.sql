create or replace function public.cash_session_expected_cash_amount(
  p_session_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(session_row.opening_amount, 0)
    + coalesce(sum(
      case
        when coalesce(method_row.method_kind, case when lower(coalesce(movement_row.payment_method, '')) = 'efectivo' then 'cash' else 'other' end) = 'cash'
          and movement_row.movement_type = 'ingreso' then movement_row.amount
        when coalesce(method_row.method_kind, case when lower(coalesce(movement_row.payment_method, '')) = 'efectivo' then 'cash' else 'other' end) = 'cash'
          and movement_row.movement_type = 'egreso' then -movement_row.amount
        else 0
      end
    ), 0)
  from public.cash_register_sessions session_row
  left join public.cash_movements movement_row
    on movement_row.register_session_id = session_row.id
    and movement_row.is_deleted = false
    and movement_row.status <> 'anulado'
  left join public.cash_payment_methods method_row
    on method_row.code = movement_row.payment_method
  where session_row.id = p_session_id
  group by session_row.id, session_row.opening_amount;
$$;

create or replace function public.close_cash_register_session(
  p_session_id uuid,
  p_counted_amount numeric,
  p_notes text default null
)
returns public.cash_register_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_session public.cash_register_sessions%rowtype;
  expected_total numeric(12,2);
  updated_session public.cash_register_sessions%rowtype;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'Solo administracion puede cerrar caja.';
  end if;

  if p_counted_amount is null then
    raise exception 'Debes indicar el monto contado.';
  end if;

  select *
  into current_session
  from public.cash_register_sessions
  where id = p_session_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos la apertura de caja.';
  end if;

  if current_session.status = 'cerrada' then
    return current_session;
  end if;

  expected_total := public.cash_session_expected_cash_amount(current_session.id);

  update public.cash_register_sessions
  set status = 'cerrada',
      closing_expected_amount = expected_total,
      closing_counted_amount = p_counted_amount,
      closing_difference_amount = p_counted_amount - expected_total,
      closing_notes = nullif(trim(coalesce(p_notes, '')), ''),
      closed_by = auth.uid(),
      closed_at = now(),
      updated_at = now()
  where id = current_session.id
  returning *
  into updated_session;

  return updated_session;
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

  expected_total := public.cash_session_expected_cash_amount(current_session.id);

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

grant execute on function public.cash_session_expected_cash_amount(uuid) to authenticated;
grant execute on function public.close_cash_register_session(uuid, numeric, text) to authenticated;
grant execute on function public.record_cash_session_count(uuid, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
