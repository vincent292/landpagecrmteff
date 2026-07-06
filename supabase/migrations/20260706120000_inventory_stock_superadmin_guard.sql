create or replace function public.guard_inventory_direct_stock_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.current_stock is distinct from old.current_stock
     and current_user in ('authenticated', 'anon')
     and not (
       public.is_superadmin()
       or exists (
         select 1
         from public.profiles
         where id = auth.uid()
           and role = 'admin'
       )
     ) then
    raise exception 'Solo Superusuario o Administrador/a puede editar stock actual directo. Usa movimientos, lotes, pedidos o conteos para cambiar inventario.';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_items_guard_direct_stock_update on public.inventory_items;
create trigger inventory_items_guard_direct_stock_update
before update on public.inventory_items
for each row execute function public.guard_inventory_direct_stock_update();
