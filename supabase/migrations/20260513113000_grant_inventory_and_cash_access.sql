grant select, insert, update, delete on public.inventory_items to authenticated;
grant select, insert, update, delete on public.inventory_adjustments to authenticated;
grant select, insert, update, delete on public.cash_movements to authenticated;
grant select, insert, update, delete on public.cash_closures to authenticated;
grant execute on function public.apply_inventory_adjustment(uuid, text, numeric, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';
