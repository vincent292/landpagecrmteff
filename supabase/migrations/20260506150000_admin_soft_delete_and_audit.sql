create table if not exists public.admin_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('soft_delete', 'hard_delete', 'restore')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  actor_name text,
  actor_email text,
  record_snapshot jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
declare
  active_tables text[] := array[
    'treatments',
    'promotions',
    'courses',
    'calendar_events',
    'gallery_albums',
    'testimonials',
    'doctor_profiles',
    'books',
    'book_download_tokens',
    'doctor_availability_rules',
    'availability_blocks'
  ];
  deleted_tables text[] := array[
    'profiles',
    'patients',
    'information_requests',
    'course_enrollments',
    'clinical_histories',
    'clinical_evolutions',
    'patient_photos',
    'photo_comparisons',
    'appointments',
    'patient_prescriptions',
    'post_treatment_cares',
    'book_orders',
    'appointment_reservations'
  ];
  table_name text;
begin
  foreach table_name in array active_tables loop
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', table_name);
    execute format('alter table public.%I add column if not exists deleted_by uuid references public.profiles(id) on delete set null', table_name);
    execute format('alter table public.%I add column if not exists deleted_by_role text', table_name);
    execute format('alter table public.%I add column if not exists deleted_by_name text', table_name);
    execute format('alter table public.%I add column if not exists deleted_by_email text', table_name);
  end loop;

  foreach table_name in array deleted_tables loop
    execute format('alter table public.%I add column if not exists is_deleted boolean not null default false', table_name);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', table_name);
    execute format('alter table public.%I add column if not exists deleted_by uuid references public.profiles(id) on delete set null', table_name);
    execute format('alter table public.%I add column if not exists deleted_by_role text', table_name);
    execute format('alter table public.%I add column if not exists deleted_by_name text', table_name);
    execute format('alter table public.%I add column if not exists deleted_by_email text', table_name);
  end loop;
end $$;

create or replace function public.capture_delete_actor()
returns table (
  actor_profile_id uuid,
  actor_role text,
  actor_name text,
  actor_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.role,
    p.full_name,
    p.email
  from public.profiles p
  where p.id = auth.uid()
$$;

create or replace function public.audit_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  did_soft_delete boolean := false;
  did_restore boolean := false;
begin
  select * into actor from public.capture_delete_actor();

  did_soft_delete :=
    (
      (to_jsonb(old) ? 'deleted_at')
      and (old.deleted_at is null and new.deleted_at is not null)
    )
    or (
      (to_jsonb(old) ? 'is_deleted')
      and coalesce(old.is_deleted, false) = false
      and coalesce(new.is_deleted, false) = true
    );

  did_restore :=
    (
      (to_jsonb(old) ? 'deleted_at')
      and (old.deleted_at is not null and new.deleted_at is null)
    )
    or (
      (to_jsonb(old) ? 'is_deleted')
      and coalesce(old.is_deleted, false) = true
      and coalesce(new.is_deleted, false) = false
    );

  if did_soft_delete then
    insert into public.admin_deletion_audit (
      table_name,
      record_id,
      action,
      actor_profile_id,
      actor_role,
      actor_name,
      actor_email,
      record_snapshot
    )
    values (
      tg_table_name,
      old.id,
      'soft_delete',
      actor.actor_profile_id,
      actor.actor_role,
      actor.actor_name,
      actor.actor_email,
      to_jsonb(new)
    );
  elsif did_restore then
    insert into public.admin_deletion_audit (
      table_name,
      record_id,
      action,
      actor_profile_id,
      actor_role,
      actor_name,
      actor_email,
      record_snapshot
    )
    values (
      tg_table_name,
      old.id,
      'restore',
      actor.actor_profile_id,
      actor.actor_role,
      actor.actor_name,
      actor.actor_email,
      to_jsonb(new)
    );
  end if;

  return new;
end;
$$;

create or replace function public.require_superadmin_and_audit_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
begin
  if not public.is_superadmin() then
    raise exception 'Solo el superusuario puede eliminar de forma permanente.'
      using errcode = '42501';
  end if;

  select * into actor from public.capture_delete_actor();

  insert into public.admin_deletion_audit (
    table_name,
    record_id,
    action,
    actor_profile_id,
    actor_role,
    actor_name,
    actor_email,
    record_snapshot
  )
  values (
    tg_table_name,
    old.id,
    'hard_delete',
    actor.actor_profile_id,
    actor.actor_role,
    actor.actor_name,
    actor.actor_email,
    to_jsonb(old)
  );

  return old;
end;
$$;

do $$
declare
  tracked_tables text[] := array[
    'profiles',
    'patients',
    'treatments',
    'promotions',
    'information_requests',
    'courses',
    'course_enrollments',
    'calendar_events',
    'gallery_albums',
    'testimonials',
    'clinical_histories',
    'clinical_evolutions',
    'patient_photos',
    'photo_comparisons',
    'appointments',
    'patient_prescriptions',
    'post_treatment_cares',
    'books',
    'book_orders',
    'book_download_tokens',
    'doctor_profiles',
    'doctor_availability_rules',
    'availability_blocks',
    'appointment_reservations'
  ];
  table_name text;
begin
  foreach table_name in array tracked_tables loop
    execute format('drop trigger if exists audit_soft_delete_%I on public.%I', table_name, table_name);
    execute format(
      'create trigger audit_soft_delete_%I after update on public.%I for each row execute procedure public.audit_soft_delete()',
      table_name,
      table_name
    );

    execute format('drop trigger if exists require_superadmin_delete_%I on public.%I', table_name, table_name);
    execute format(
      'create trigger require_superadmin_delete_%I before delete on public.%I for each row execute procedure public.require_superadmin_and_audit_hard_delete()',
      table_name,
      table_name
    );
  end loop;
end $$;
