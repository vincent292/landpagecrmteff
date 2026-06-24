drop extension if exists "pg_net";

drop policy "Staff manage payment plan installments" on "public"."payment_plan_installments";

drop policy "Staff manage payment plan receipts" on "public"."payment_plan_receipts";

drop policy "Staff manage payment plans" on "public"."payment_plans";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.can_manage_payment_plans()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_role(array['superadmin', 'admin', 'assistant']);
$function$
;

CREATE OR REPLACE FUNCTION public.cash_session_expected_cash_amount(p_session_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.close_cash_register_session(p_session_id uuid, p_counted_amount numeric, p_notes text DEFAULT NULL::text)
 RETURNS public.cash_register_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_payment_plan(p_patient_id uuid, p_total_amount numeric, p_initial_payment_amount numeric, p_initial_payment_date date, p_initial_payment_method text, p_months_count integer, p_installment_amount numeric, p_first_due_date date, p_allow_treatment_before_completion boolean DEFAULT false, p_treatment_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS public.payment_plans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if auth.uid() is null or not public.can_manage_payment_plans() then
    raise exception 'Solo administracion operativa puede crear planes de pago.';
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
$function$
;

CREATE OR REPLACE FUNCTION public.record_cash_session_count(p_session_id uuid, p_count_type text, p_notes text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb)
 RETURNS public.cash_session_counts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.review_payment_plan_receipt(p_receipt_id uuid, p_action text, p_admin_notes text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text, p_payment_date date DEFAULT NULL::date)
 RETURNS public.payment_plan_installments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  receipt_row public.payment_plan_receipts%rowtype;
  installment_row public.payment_plan_installments%rowtype;
  plan_row public.payment_plans%rowtype;
  patient_row public.patients%rowtype;
  movement_id uuid;
  action_value text := lower(trim(coalesce(p_action, '')));
  resolved_payment_date date;
begin
  if auth.uid() is null or not public.can_manage_payment_plans() then
    raise exception 'Solo administracion operativa puede revisar comprobantes del plan.';
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
$function$
;


  create policy "Staff manage payment plan installments"
  on "public"."payment_plan_installments"
  as permissive
  for all
  to public
using (public.can_manage_payment_plans())
with check (public.can_manage_payment_plans());



  create policy "Staff manage payment plan receipts"
  on "public"."payment_plan_receipts"
  as permissive
  for all
  to public
using (public.can_manage_payment_plans())
with check (public.can_manage_payment_plans());



  create policy "Staff manage payment plans"
  on "public"."payment_plans"
  as permissive
  for all
  to public
using (public.can_manage_payment_plans())
with check (public.can_manage_payment_plans());



