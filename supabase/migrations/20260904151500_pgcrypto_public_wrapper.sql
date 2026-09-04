create extension if not exists pgcrypto with schema extensions;

create or replace function public.gen_random_bytes(integer)
returns bytea
language sql
volatile
as $$
  select extensions.gen_random_bytes($1)
$$;
