alter table public.inventory_items
  add column if not exists presentation_unit_id uuid references public.inventory_units(id) on delete set null,
  add column if not exists units_per_presentation numeric(12,2) not null default 1;

alter table public.inventory_lots
  add column if not exists presentation_unit_id uuid references public.inventory_units(id) on delete set null,
  add column if not exists units_per_presentation numeric(12,2) not null default 1;

update public.inventory_items
set units_per_presentation = 1
where units_per_presentation is null or units_per_presentation <= 0;

update public.inventory_lots
set units_per_presentation = 1
where units_per_presentation is null or units_per_presentation <= 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_items_units_per_presentation_positive'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_units_per_presentation_positive
      check (units_per_presentation > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_lots_units_per_presentation_positive'
  ) then
    alter table public.inventory_lots
      add constraint inventory_lots_units_per_presentation_positive
      check (units_per_presentation > 0);
  end if;
end;
$$;

create index if not exists inventory_items_presentation_unit_idx on public.inventory_items(presentation_unit_id);
create index if not exists inventory_lots_presentation_unit_idx on public.inventory_lots(presentation_unit_id);

notify pgrst, 'reload schema';
