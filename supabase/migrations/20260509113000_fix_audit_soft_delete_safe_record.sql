create or replace function public.audit_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
  old_deleted_at text := nullif(coalesce(old_row->>'deleted_at', ''), '');
  new_deleted_at text := nullif(coalesce(new_row->>'deleted_at', ''), '');
  old_is_deleted boolean := coalesce((old_row->>'is_deleted')::boolean, false);
  new_is_deleted boolean := coalesce((new_row->>'is_deleted')::boolean, false);
  did_soft_delete boolean := false;
  did_restore boolean := false;
begin
  select * into actor from public.capture_delete_actor();

  did_soft_delete :=
    (
      (old_row ? 'deleted_at')
      and old_deleted_at is null
      and new_deleted_at is not null
    )
    or (
      (old_row ? 'is_deleted')
      and old_is_deleted = false
      and new_is_deleted = true
    );

  did_restore :=
    (
      (old_row ? 'deleted_at')
      and old_deleted_at is not null
      and new_deleted_at is null
    )
    or (
      (old_row ? 'is_deleted')
      and old_is_deleted = true
      and new_is_deleted = false
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
      new_row
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
      new_row
    );
  end if;

  return new;
end;
$$;
