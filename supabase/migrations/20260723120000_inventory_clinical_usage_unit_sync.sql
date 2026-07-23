update public.clinical_inventory_usages usages
set unit_label = items.unit
from public.inventory_items items
where usages.item_id = items.id
  and coalesce(usages.unit_label, '') <> coalesce(items.unit, '');

create or replace function public.sync_clinical_usage_unit_label()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.unit, '') <> coalesce(old.unit, '') then
    update public.clinical_inventory_usages
    set unit_label = new.unit
    where item_id = new.id
      and coalesce(unit_label, '') <> coalesce(new.unit, '');
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_items_sync_clinical_usage_unit_label on public.inventory_items;
create trigger inventory_items_sync_clinical_usage_unit_label
after update of unit on public.inventory_items
for each row execute function public.sync_clinical_usage_unit_label();
