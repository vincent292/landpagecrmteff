alter table public.site_settings
  add column if not exists payment_qr_image text,
  add column if not exists payment_qr_updated_at timestamptz,
  add column if not exists payment_qr_updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists payment_qr_updated_by_email text;

update public.site_settings
set payment_qr_image = coalesce(payment_qr_image, course_qr_payment_image, appointment_qr_payment_image)
where id = true;

create table if not exists public.site_payment_qr_security (
  id boolean primary key default true,
  password_hash text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_by_email text,
  constraint site_payment_qr_security_singleton check (id)
);

create table if not exists public.site_payment_qr_audit (
  id uuid primary key default gen_random_uuid(),
  previous_image text,
  next_image text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_email text,
  changed_by_name text,
  changed_at timestamptz not null default now(),
  change_reason text
);

alter table public.site_payment_qr_security enable row level security;
alter table public.site_payment_qr_audit enable row level security;

drop policy if exists "Superadmin read payment qr security" on public.site_payment_qr_security;
create policy "Superadmin read payment qr security"
on public.site_payment_qr_security
for select
using (public.is_superadmin());

drop policy if exists "Superadmin manage payment qr security" on public.site_payment_qr_security;
create policy "Superadmin manage payment qr security"
on public.site_payment_qr_security
for all
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "Superadmin read payment qr audit" on public.site_payment_qr_audit;
create policy "Superadmin read payment qr audit"
on public.site_payment_qr_audit
for select
using (public.is_superadmin());

create or replace function public.guard_payment_qr_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.payment_qr_image is distinct from old.payment_qr_image
    or new.appointment_qr_payment_image is distinct from old.appointment_qr_payment_image
    or new.course_qr_payment_image is distinct from old.course_qr_payment_image
    or new.payment_qr_updated_at is distinct from old.payment_qr_updated_at
    or new.payment_qr_updated_by is distinct from old.payment_qr_updated_by
    or new.payment_qr_updated_by_email is distinct from old.payment_qr_updated_by_email
  ) and coalesce(current_setting('app.allow_payment_qr_update', true), 'false') <> 'true' then
    raise exception 'El QR general de pagos solo puede cambiarse desde el flujo protegido.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_payment_qr_fields on public.site_settings;
create trigger guard_payment_qr_fields
before update on public.site_settings
for each row execute function public.guard_payment_qr_fields();

drop function if exists public.payment_qr_password_configured();
create or replace function public.payment_qr_password_configured()
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.is_admin_staff()
    and exists (
    select 1
    from public.site_payment_qr_security
    where id = true
  );
$$;

drop function if exists public.set_payment_qr_password(text, text);
create or replace function public.set_payment_qr_password(
  p_new_password text,
  p_current_password text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles%rowtype;
  security_row public.site_payment_qr_security%rowtype;
begin
  if auth.uid() is null or not public.is_superadmin() then
    raise exception 'Solo superadmin puede configurar la clave del QR.';
  end if;

  if coalesce(length(trim(coalesce(p_new_password, ''))), 0) < 6 then
    raise exception 'La clave del QR debe tener al menos 6 caracteres.';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = auth.uid();

  select *
  into security_row
  from public.site_payment_qr_security
  where id = true;

  if security_row.id is not null and security_row.password_hash <> crypt(coalesce(p_current_password, ''), security_row.password_hash) then
    raise exception 'La clave actual del QR no es valida.';
  end if;

  insert into public.site_payment_qr_security (
    id,
    password_hash,
    updated_at,
    updated_by,
    updated_by_email
  )
  values (
    true,
    crypt(p_new_password, gen_salt('bf')),
    now(),
    auth.uid(),
    current_profile.email
  )
  on conflict (id) do update
  set
    password_hash = excluded.password_hash,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    updated_by_email = excluded.updated_by_email
  returning *
  into security_row;

  return true;
end;
$$;

create or replace function public.update_general_payment_qr(
  p_image text,
  p_password text,
  p_reason text default null
)
returns public.site_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles%rowtype;
  settings_row public.site_settings%rowtype;
  security_row public.site_payment_qr_security%rowtype;
  previous_image_value text;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'No tienes permiso para cambiar el QR general de pagos.';
  end if;

  if coalesce(trim(p_image), '') = '' then
    raise exception 'Debes subir una imagen QR antes de guardar.';
  end if;

  select *
  into security_row
  from public.site_payment_qr_security
  where id = true;

  if security_row.id is null then
    raise exception 'Primero un superadmin debe configurar la clave del QR.';
  end if;

  if security_row.password_hash <> crypt(coalesce(p_password, ''), security_row.password_hash) then
    raise exception 'La clave del QR no es valida.';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = auth.uid();

  select payment_qr_image
  into previous_image_value
  from public.site_settings
  where id = true;

  perform set_config('app.allow_payment_qr_update', 'true', true);

  update public.site_settings
  set
    payment_qr_image = p_image,
    appointment_qr_payment_image = p_image,
    course_qr_payment_image = p_image,
    payment_qr_updated_at = now(),
    payment_qr_updated_by = auth.uid(),
    payment_qr_updated_by_email = current_profile.email
  where id = true
  returning *
  into settings_row;

  insert into public.site_payment_qr_audit (
    previous_image,
    next_image,
    changed_by,
    changed_by_email,
    changed_by_name,
    change_reason
  )
  values (
    previous_image_value,
    p_image,
    auth.uid(),
    current_profile.email,
    current_profile.full_name,
    nullif(trim(coalesce(p_reason, '')), '')
  );

  return settings_row;
end;
$$;

grant execute on function public.payment_qr_password_configured() to authenticated;
grant execute on function public.set_payment_qr_password(text, text) to authenticated;
grant execute on function public.update_general_payment_qr(text, text, text) to authenticated;
