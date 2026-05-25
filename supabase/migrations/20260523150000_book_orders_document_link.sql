alter table public.book_orders
  add column if not exists document_number text;

update public.book_orders
set document_number = public.normalize_document_number(document_number)
where document_number is not null;

create index if not exists book_orders_document_number_idx
on public.book_orders ((public.normalize_document_number(document_number)))
where document_number is not null
  and coalesce(is_deleted, false) = false;

create or replace function public.public_submit_book_order(
  p_book_id uuid,
  p_full_name text,
  p_document_number text,
  p_phone text default null,
  p_email text default null,
  p_city text default null,
  p_payment_receipt_path text default null,
  p_user_id uuid default null
)
returns public.book_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_document text := public.normalize_document_number(p_document_number);
  trimmed_full_name text := nullif(trim(coalesce(p_full_name, '')), '');
  trimmed_email text := nullif(trim(coalesce(p_email, '')), '');
  trimmed_receipt_path text := nullif(trim(coalesce(p_payment_receipt_path, '')), '');
  trimmed_phone text := nullif(trim(coalesce(p_phone, '')), '');
  trimmed_city text := nullif(trim(coalesce(p_city, '')), '');
  resolved_user_id uuid := null;
  created_row public.book_orders%rowtype;
begin
  if p_book_id is null then
    raise exception 'Debes seleccionar un libro.';
  end if;

  if trimmed_full_name is null then
    raise exception 'Escribe el nombre completo del comprador.';
  end if;

  if trimmed_email is null then
    raise exception 'Escribe un correo electronico valido.';
  end if;

  if normalized_document is null or length(normalized_document) < 5 then
    raise exception 'Escribe un numero de carnet valido.';
  end if;

  if trimmed_receipt_path is null then
    raise exception 'Debes subir el comprobante de pago.';
  end if;

  if auth.uid() is null then
    if p_user_id is not null then
      raise exception 'Debes iniciar sesion para vincular la compra a una cuenta.'
        using errcode = '42501';
    end if;
  else
    if p_user_id is not null and p_user_id <> auth.uid() and not public.is_staff() then
      raise exception 'No puedes registrar pedidos para otra cuenta.'
        using errcode = '42501';
    end if;

    resolved_user_id := coalesce(p_user_id, auth.uid());
  end if;

  insert into public.book_orders (
    book_id,
    user_id,
    full_name,
    document_number,
    email,
    phone,
    city,
    payment_receipt_path,
    status
  )
  values (
    p_book_id,
    resolved_user_id,
    trimmed_full_name,
    normalized_document,
    trimmed_email,
    trimmed_phone,
    trimmed_city,
    trimmed_receipt_path,
    'En revision'
  )
  returning *
  into created_row;

  return created_row;
end;
$$;

create or replace function public.sync_book_access_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_document text := public.normalize_document_number(new.document_number);
begin
  if normalized_document is null or coalesce(new.is_deleted, false) then
    return new;
  end if;

  update public.book_orders
  set user_id = new.id
  where public.normalize_document_number(document_number) = normalized_document
    and coalesce(is_deleted, false) = false
    and (user_id is null or user_id = new.id);

  update public.book_download_tokens tokens
  set user_id = new.id
  from public.book_orders orders
  where tokens.order_id = orders.id
    and public.normalize_document_number(orders.document_number) = normalized_document
    and coalesce(orders.is_deleted, false) = false
    and tokens.deleted_at is null
    and (tokens.user_id is null or tokens.user_id = new.id);

  return new;
end;
$$;

drop trigger if exists on_profile_sync_book_access on public.profiles;
create trigger on_profile_sync_book_access
after insert or update on public.profiles
for each row execute procedure public.sync_book_access_from_profile();

update public.book_orders orders
set user_id = profiles.id
from public.profiles profiles
where public.normalize_document_number(orders.document_number) is not null
  and public.normalize_document_number(orders.document_number) = public.normalize_document_number(profiles.document_number)
  and coalesce(orders.is_deleted, false) = false
  and coalesce(profiles.is_deleted, false) = false
  and (orders.user_id is null or orders.user_id = profiles.id);

update public.book_download_tokens tokens
set user_id = profiles.id
from public.book_orders orders
join public.profiles profiles
  on public.normalize_document_number(orders.document_number) = public.normalize_document_number(profiles.document_number)
where tokens.order_id = orders.id
  and public.normalize_document_number(orders.document_number) is not null
  and coalesce(orders.is_deleted, false) = false
  and coalesce(profiles.is_deleted, false) = false
  and tokens.deleted_at is null
  and (tokens.user_id is null or tokens.user_id = profiles.id);

grant execute on function public.public_submit_book_order(uuid, text, text, text, text, text, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
