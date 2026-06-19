create or replace function public.enforce_inventory_count_closure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  opener_id uuid;
begin
  if new.created_by is distinct from old.created_by
    or new.opened_by is distinct from old.opened_by
    or new.opened_at is distinct from old.opened_at then
    raise exception 'La auditoria de apertura del turno de inventario no puede modificarse.';
  end if;

  if old.status = 'cerrado' then
    if new.status is distinct from old.status
      or new.closed_by is distinct from old.closed_by
      or new.closed_at is distinct from old.closed_at then
      raise exception 'El turno de inventario ya esta cerrado y su auditoria no puede modificarse.';
    end if;

    return new;
  end if;

  if new.status = 'cerrado' then
    opener_id := coalesce(old.opened_by, old.created_by);

    if auth.uid() is null or opener_id is distinct from auth.uid() then
      raise exception 'Solo la responsable que abrio este turno puede cerrarlo.';
    end if;

    new.closed_by := auth.uid();
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_by := null;
    new.closed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_counts_enforce_closure on public.inventory_counts;
create trigger inventory_counts_enforce_closure
before update on public.inventory_counts
for each row execute function public.enforce_inventory_count_closure();

notify pgrst, 'reload schema';
