alter table public.course_enrollments
  add column if not exists payment_receipt_path text,
  add column if not exists payment_submitted_at timestamp,
  add column if not exists payment_verified_at timestamp,
  add column if not exists admin_notes text;

update public.course_enrollments
set payment_receipt_path = coalesce(payment_receipt_path, payment_receipt_url)
where payment_receipt_path is null
  and payment_receipt_url is not null;

alter table public.site_settings
  add column if not exists course_qr_payment_image text;

drop policy if exists "Receipt owners and staff read payment receipts" on storage.objects;
create policy "Receipt owners and staff read payment receipts" on storage.objects
for select using (
  bucket_id = 'payment-receipts-private'
  and (
    public.is_staff()
    or exists (
      select 1
      from public.book_orders bo
      where bo.payment_receipt_path = storage.objects.name
        and bo.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.course_enrollments ce
      where coalesce(ce.payment_receipt_path, ce.payment_receipt_url) = storage.objects.name
        and ce.user_id = auth.uid()
    )
  )
);

create or replace function public.set_course_enrollment_status(
  p_enrollment_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns public.course_enrollments
language plpgsql
security definer
set search_path = public
as $$
declare
  enrollment_row public.course_enrollments%rowtype;
  course_slots integer;
begin
  select *
  into enrollment_row
  from public.course_enrollments
  where id = p_enrollment_id
  for update;

  if enrollment_row.id is null then
    raise exception 'Enrollment not found';
  end if;

  if enrollment_row.course_id is not null then
    select available_slots
    into course_slots
    from public.courses
    where id = enrollment_row.course_id
    for update;
  end if;

  if enrollment_row.status <> 'Confirmado' and p_status = 'Confirmado' and course_slots is not null then
    if course_slots <= 0 then
      raise exception 'No hay cupos disponibles para aprobar esta inscripcion.';
    end if;

    update public.courses
    set available_slots = available_slots - 1
    where id = enrollment_row.course_id;
  end if;

  if enrollment_row.status = 'Confirmado' and p_status <> 'Confirmado' and course_slots is not null then
    update public.courses
    set available_slots = available_slots + 1
    where id = enrollment_row.course_id;
  end if;

  update public.course_enrollments
  set
    status = p_status,
    admin_notes = coalesce(p_admin_notes, admin_notes),
    payment_verified_at = case
      when p_status = 'Confirmado' then coalesce(payment_verified_at, now())
      else payment_verified_at
    end
  where id = p_enrollment_id
  returning *
  into enrollment_row;

  return enrollment_row;
end;
$$;

create or replace function public.cleanup_expired_course_enrollment_receipts()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  affected_count integer := 0;
begin
  with expired as (
    select id, payment_receipt_path
    from public.course_enrollments
    where payment_receipt_path is not null
      and coalesce(payment_verified_at, payment_submitted_at, created_at) <= now() - interval '7 days'
  ),
  deleted_objects as (
    delete from storage.objects so
    using expired
    where so.bucket_id = 'payment-receipts-private'
      and so.name = expired.payment_receipt_path
    returning so.name
  )
  update public.course_enrollments ce
  set
    payment_receipt_path = null,
    payment_receipt_url = null
  where ce.id in (select id from expired);

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;
