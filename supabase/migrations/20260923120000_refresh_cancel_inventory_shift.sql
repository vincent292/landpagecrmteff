-- Refresh the cancellation RPC after the immutable inventory trigger changes.
create or replace function public.cancel_inventory_shift(
  p_count_id uuid,
  p_notes text default null
)
returns public.inventory_counts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_shift public.inventory_counts%rowtype;
  actor_profile public.profiles%rowtype;
  line_row public.inventory_count_lines%rowtype;
  current_item public.inventory_items%rowtype;
  target_stock numeric(12,2);
  updated_shift public.inventory_counts%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede cancelar turnos de inventario.';
  end if;

  perform set_config('app.inventory_shift_cancel', 'on', true);

  select *
  into current_shift
  from public.inventory_counts
  where id = p_count_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos el turno de inventario.';
  end if;

  if current_shift.status <> 'abierto' then
    raise exception 'Solo se pueden cancelar turnos abiertos.';
  end if;

  select *
  into actor_profile
  from public.profiles
  where id = auth.uid();

  if coalesce(current_shift.opened_by, current_shift.created_by) <> auth.uid()
    and coalesce(actor_profile.role, '') not in ('superadmin', 'admin') then
    raise exception 'Solo quien abrio el turno o un administrador puede cancelarlo.';
  end if;

  if current_shift.opening_count_completed_at is not null then
    for line_row in
      select *
      from public.inventory_count_lines
      where count_id = current_shift.id
        and coalesce(opening_difference_stock, 0) <> 0
      order by created_at
    loop
      select *
      into current_item
      from public.inventory_items
      where id = line_row.item_id
        and is_deleted = false
      for update;

      if found then
        target_stock := current_item.current_stock - coalesce(line_row.opening_difference_stock, 0);

        if target_stock < 0 then
          raise exception 'No se puede cancelar este turno porque el stock posterior ya depende de su apertura. Cierra/revisa los movimientos antes de cancelarlo.';
        end if;

        perform public.reconcile_inventory_opening_stock(
          line_row.item_id,
          target_stock,
          current_shift.id,
          current_shift.location_id,
          concat_ws(
            ' - ',
            'Reversion de apertura cancelada',
            nullif(trim(coalesce(current_shift.shift_name, '')), ''),
            nullif(trim(coalesce(line_row.opening_notes, '')), ''),
            nullif(trim(coalesce(p_notes, '')), '')
          )
        );
      end if;
    end loop;
  end if;

  update public.inventory_counts
  set status = 'cancelado',
      is_deleted = true,
      deleted_at = now(),
      deleted_by = auth.uid(),
      deleted_by_role = actor_profile.role,
      deleted_by_name = actor_profile.full_name,
      deleted_by_email = actor_profile.email,
      notes = concat_ws(
        ' - ',
        nullif(trim(coalesce(notes, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        case
          when current_shift.opening_count_completed_at is null
            then 'Cancelado sin modificar stock'
          else 'Cancelado con reversion de apertura'
        end
      ),
      closed_by = auth.uid(),
      closed_at = now(),
      updated_at = now()
  where id = current_shift.id
  returning * into updated_shift;

  return updated_shift;
end;
$$;

grant execute on function public.cancel_inventory_shift(uuid, text) to authenticated;

notify pgrst, 'reload schema';
