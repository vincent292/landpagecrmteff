-- Historical inventory usage is an immutable fact. Changing an item's current
-- unit must never relabel quantities that were recorded under another unit.
drop trigger if exists inventory_items_sync_clinical_usage_unit_label on public.inventory_items;
drop function if exists public.sync_clinical_usage_unit_label();
