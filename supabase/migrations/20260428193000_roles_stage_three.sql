alter table public.profiles alter column role set default 'user';

update public.profiles
set role = case
  when role = 'assistant' then 'admin'
  when role in ('patient', 'student') then 'user'
  when role in ('superadmin', 'doctor', 'admin', 'user') then role
  else 'user'
end;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('superadmin', 'doctor', 'admin')
  );
$$;

create or replace function public.is_admin_or_assistant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('superadmin', 'doctor', 'admin')
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'superadmin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;
