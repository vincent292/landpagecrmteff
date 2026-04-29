create or replace function public.public_download_book_with_token(p_token text)
returns table (
  signed_file_path text,
  book_title text,
  token_value text,
  used_count int,
  max_uses int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.book_download_tokens%rowtype;
  book_row public.books%rowtype;
begin
  select *
  into token_row
  from public.book_download_tokens
  where token = upper(trim(p_token))
  for update;

  if not found then
    raise exception 'Token invalido o agotado.';
  end if;

  if token_row.is_active is not true
    or token_row.used_count >= token_row.max_uses
    or (token_row.expires_at is not null and token_row.expires_at <= now()) then
    raise exception 'Token invalido o agotado.';
  end if;

  select *
  into book_row
  from public.books
  where id = token_row.book_id
    and file_path is not null;

  if not found then
    raise exception 'El archivo del libro no esta disponible.';
  end if;

  update public.book_download_tokens
  set used_count = used_count + 1
  where id = token_row.id
  returning * into token_row;

  insert into public.book_download_logs (token_id, book_id, user_id)
  values (token_row.id, token_row.book_id, token_row.user_id);

  signed_file_path := book_row.file_path;
  book_title := book_row.title;
  token_value := token_row.token;
  used_count := token_row.used_count;
  max_uses := token_row.max_uses;
  return next;
end;
$$;

drop policy if exists "Public token download can read matching book files" on storage.objects;
create policy "Public token download can read matching book files" on storage.objects
for select using (
  bucket_id = 'book-files-private'
  and exists (
    select 1
    from public.book_download_tokens t
    join public.books b on b.id = t.book_id
    where b.file_path = storage.objects.name
      and t.is_active = true
      and t.used_count <= t.max_uses
      and (t.expires_at is null or t.expires_at > now())
  )
);
