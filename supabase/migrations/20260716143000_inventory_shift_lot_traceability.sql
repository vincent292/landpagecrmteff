create or replace function public.close_inventory_shift(
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
  current_item public.inventory_items%rowtype;
  line_row public.inventory_count_lines%rowtype;
  current_location public.inventory_locations%rowtype;
  lot_row public.inventory_lots%rowtype;
  final_difference numeric(12,2);
  remaining_quantity numeric(12,2);
  lot_quantity numeric(12,2);
  movement_reason text;
  updated_shift public.inventory_counts%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede cerrar turnos de inventario.';
  end if;

  select *
  into current_shift
  from public.inventory_counts
  where id = p_count_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos el turno de inventario.';
  end if;

  if current_shift.status = 'cerrado' then
    return current_shift;
  end if;

  if current_shift.location_id is not null then
    select *
    into current_location
    from public.inventory_locations
    where id = current_shift.location_id;
  end if;

  for line_row in
    select *
    from public.inventory_count_lines
    where count_id = current_shift.id
    order by created_at
  loop
    select *
    into current_item
    from public.inventory_items
    where id = line_row.item_id
      and is_deleted = false
    for update;

    if found then
      final_difference := line_row.counted_stock - current_item.current_stock;
      movement_reason := concat_ws(
        ' - ',
        'Diferencia en cierre de turno',
        nullif(trim(coalesce(current_shift.shift_name, '')), ''),
        case
          when final_difference < 0 then 'faltante fisico'
          when final_difference > 0 then 'sobrante fisico'
          else null
        end
      );

      update public.inventory_count_lines
      set expected_stock = current_item.current_stock,
          difference_stock = final_difference,
          counted_by = coalesce(counted_by, auth.uid()),
          updated_at = now()
      where id = line_row.id;

      if final_difference <> 0 then
        insert into public.inventory_adjustments (
          item_id,
          item_name_snapshot,
          category_snapshot,
          location_name_snapshot,
          adjustment_type,
          previous_stock,
          new_stock,
          difference_stock,
          reason,
          counted_at,
          created_by
        )
        values (
          current_item.id,
          current_item.name,
          current_item.category,
          current_location.name,
          'conteo_nocturno',
          current_item.current_stock,
          line_row.counted_stock,
          final_difference,
          concat_ws(' - ', 'Cierre de turno', nullif(trim(coalesce(current_shift.shift_name, '')), ''), nullif(trim(coalesce(p_notes, current_shift.notes, '')), '')),
          now(),
          auth.uid()
        );

        remaining_quantity := abs(final_difference);

        if final_difference < 0 then
          for lot_row in
            select *
            from public.inventory_lots
            where item_id = current_item.id
              and is_deleted = false
              and is_active = true
              and current_quantity > 0
              and (
                current_shift.location_id is null
                or location_id is not distinct from current_shift.location_id
                or location_id is null
              )
            order by expiration_date asc nulls last, received_date asc nulls last, created_at asc
            for update
          loop
            exit when remaining_quantity <= 0;
            lot_quantity := least(remaining_quantity, lot_row.current_quantity);

            update public.inventory_lots
            set current_quantity = current_quantity - lot_quantity,
                updated_by = auth.uid(),
                updated_at = now()
            where id = lot_row.id;

            insert into public.inventory_movements (
              item_id,
              lot_id,
              movement_type,
              quantity,
              from_location_id,
              reference,
              reason,
              movement_date,
              item_name_snapshot,
              lot_number_snapshot,
              from_location_snapshot,
              created_by
            )
            values (
              current_item.id,
              lot_row.id,
              'conteo',
              lot_quantity,
              current_shift.location_id,
              current_shift.id::text,
              concat_ws(' - ', movement_reason, 'lote ajustado por faltante'),
              now(),
              current_item.name,
              lot_row.lot_number,
              current_location.name,
              auth.uid()
            );

            remaining_quantity := remaining_quantity - lot_quantity;
          end loop;
        else
          select *
          into lot_row
          from public.inventory_lots
          where item_id = current_item.id
            and is_deleted = false
            and is_active = true
            and (
              current_shift.location_id is null
              or location_id is not distinct from current_shift.location_id
              or location_id is null
            )
          order by expiration_date asc nulls last, received_date asc nulls last, created_at asc
          limit 1
          for update;

          if found then
            update public.inventory_lots
            set current_quantity = current_quantity + remaining_quantity,
                initial_quantity = greatest(initial_quantity, current_quantity + remaining_quantity),
                updated_by = auth.uid(),
                updated_at = now()
            where id = lot_row.id;

            insert into public.inventory_movements (
              item_id,
              lot_id,
              movement_type,
              quantity,
              to_location_id,
              reference,
              reason,
              movement_date,
              item_name_snapshot,
              lot_number_snapshot,
              to_location_snapshot,
              created_by
            )
            values (
              current_item.id,
              lot_row.id,
              'conteo',
              remaining_quantity,
              current_shift.location_id,
              current_shift.id::text,
              concat_ws(' - ', movement_reason, 'lote ajustado por sobrante'),
              now(),
              current_item.name,
              lot_row.lot_number,
              current_location.name,
              auth.uid()
            );

            remaining_quantity := 0;
          end if;
        end if;

        if remaining_quantity > 0 then
          insert into public.inventory_movements (
            item_id,
            movement_type,
            quantity,
            to_location_id,
            reference,
            reason,
            movement_date,
            item_name_snapshot,
            to_location_snapshot,
            created_by
          )
          values (
            current_item.id,
            'conteo',
            remaining_quantity,
            current_shift.location_id,
            current_shift.id::text,
            concat_ws(' - ', movement_reason, 'sin lote identificado'),
            now(),
            current_item.name,
            current_location.name,
            auth.uid()
          );
        end if;
      end if;

      update public.inventory_items
      set current_stock = line_row.counted_stock,
          location_id = coalesce(current_shift.location_id, location_id),
          updated_by = auth.uid(),
          updated_at = now()
      where id = current_item.id;
    end if;
  end loop;

  update public.inventory_counts
  set status = 'cerrado',
      notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
      closed_by = auth.uid(),
      closed_at = now(),
      updated_at = now()
  where id = current_shift.id
  returning *
  into updated_shift;

  return updated_shift;
end;
$$;

notify pgrst, 'reload schema';
