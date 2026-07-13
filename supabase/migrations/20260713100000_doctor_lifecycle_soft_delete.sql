create or replace function public.soft_delete_doctor_lifecycle(p_doctor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  doctor_row public.doctor_profiles%rowtype;
  linked_table text;
  has_active_column boolean;
begin
  select *
  into actor
  from public.profiles
  where id = auth.uid()
    and coalesce(is_deleted, false) = false;

  if actor.id is null or actor.role not in ('superadmin', 'admin') then
    raise exception 'Solo administracion puede eliminar doctoras.'
      using errcode = '42501';
  end if;

  select *
  into doctor_row
  from public.doctor_profiles
  where id = p_doctor_id;

  if doctor_row.id is null then
    raise exception 'No encontramos la doctora seleccionada.'
      using errcode = 'P0002';
  end if;

  update public.doctor_profiles
  set is_active = false,
      deleted_at = coalesce(deleted_at, now()),
      deleted_by = actor.id,
      deleted_by_role = actor.role,
      deleted_by_name = actor.full_name,
      deleted_by_email = actor.email
  where id = p_doctor_id;

  if doctor_row.profile_id is not null then
    update public.profiles
    set is_deleted = true,
        deleted_at = coalesce(deleted_at, now()),
        deleted_by = actor.id,
        deleted_by_role = actor.role,
        deleted_by_name = actor.full_name,
        deleted_by_email = actor.email
    where id = doctor_row.profile_id;
  end if;

  foreach linked_table in array array[
    'treatments',
    'promotions',
    'courses',
    'calendar_events',
    'gallery_albums',
    'books',
    'doctor_availability_rules',
    'availability_blocks'
  ] loop
    if to_regclass(format('public.%I', linked_table)) is null then
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = linked_table
        and column_name in ('doctor_id', 'deleted_at')
      group by table_name
      having count(*) = 2
    ) then
      continue;
    end if;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = linked_table
        and column_name = 'is_active'
    )
    into has_active_column;

    if has_active_column then
      execute format(
        'update public.%I
         set is_active = false,
             deleted_at = coalesce(deleted_at, now()),
             deleted_by = $2,
             deleted_by_role = $3,
             deleted_by_name = $4,
             deleted_by_email = $5
         where doctor_id = $1
           and deleted_at is null',
        linked_table
      )
      using p_doctor_id, actor.id, actor.role, actor.full_name, actor.email;
    else
      execute format(
        'update public.%I
         set deleted_at = coalesce(deleted_at, now()),
             deleted_by = $2,
             deleted_by_role = $3,
             deleted_by_name = $4,
             deleted_by_email = $5
         where doctor_id = $1
           and deleted_at is null',
        linked_table
      )
      using p_doctor_id, actor.id, actor.role, actor.full_name, actor.email;
    end if;
  end loop;
end;
$$;

create or replace function public.restore_doctor_lifecycle(p_doctor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  doctor_row public.doctor_profiles%rowtype;
begin
  if not public.is_superadmin() then
    raise exception 'Solo el superusuario puede restablecer doctoras.'
      using errcode = '42501';
  end if;

  select *
  into doctor_row
  from public.doctor_profiles
  where id = p_doctor_id;

  if doctor_row.id is null then
    raise exception 'No encontramos la doctora seleccionada.'
      using errcode = 'P0002';
  end if;

  update public.doctor_profiles
  set is_active = true,
      deleted_at = null,
      deleted_by = null,
      deleted_by_role = null,
      deleted_by_name = null,
      deleted_by_email = null
  where id = p_doctor_id;

  if doctor_row.profile_id is not null then
    update public.profiles
    set is_deleted = false,
        deleted_at = null,
        deleted_by = null,
        deleted_by_role = null,
        deleted_by_name = null,
        deleted_by_email = null
    where id = doctor_row.profile_id;
  end if;
end;
$$;

grant execute on function public.soft_delete_doctor_lifecycle(uuid) to authenticated;
grant execute on function public.restore_doctor_lifecycle(uuid) to authenticated;

notify pgrst, 'reload schema';
