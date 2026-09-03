create or replace function public.confirm_inventory_shift_opening(
  p_count_id uuid
)
returns public.inventory_counts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_shift public.inventory_counts%rowtype;
  line_row public.inventory_count_lines%rowtype;
  updated_shift public.inventory_counts%rowtype;
  effective_counted_stock numeric(12,2);
  effective_difference numeric(12,2);
  opening_detail text;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Solo el personal autorizado puede confirmar la apertura.';
  end if;

  select * into current_shift
  from public.inventory_counts
  where id = p_count_id and status = 'abierto' and is_deleted = false
  for update;

  if not found then raise exception 'No encontramos el turno abierto.'; end if;
  if current_shift.opening_count_completed_at is not null then return current_shift; end if;

  for line_row in
    select * from public.inventory_count_lines where count_id = p_count_id order by created_at
  loop
    effective_counted_stock := coalesce(line_row.opening_counted_stock, line_row.opening_stock);
    effective_difference := effective_counted_stock - line_row.opening_stock;
    opening_detail := case
      when effective_difference < 0 then format(
        'Conteo de apertura: sistema %s, contado %s, faltante %s',
        line_row.opening_stock,
        effective_counted_stock,
        abs(effective_difference)
      )
      when effective_difference > 0 then format(
        'Conteo de apertura: sistema %s, contado %s, sobrante %s',
        line_row.opening_stock,
        effective_counted_stock,
        abs(effective_difference)
      )
      else null
    end;

    perform public.reconcile_inventory_opening_stock(
      line_row.item_id,
      effective_counted_stock,
      current_shift.id,
      current_shift.location_id,
      concat_ws(
        ' - ',
        'Ajuste de apertura',
        nullif(trim(coalesce(current_shift.shift_name, '')), ''),
        coalesce(nullif(trim(coalesce(line_row.opening_notes, '')), ''), opening_detail)
      )
    );

    update public.inventory_count_lines
    set opening_counted_stock = effective_counted_stock,
        opening_difference_stock = effective_difference,
        expected_stock = effective_counted_stock,
        counted_stock = effective_counted_stock,
        difference_stock = 0,
        opening_notes = case
          when effective_difference <> 0
            then coalesce(nullif(trim(coalesce(opening_notes, '')), ''), opening_detail)
          else opening_notes
        end,
        opening_counted_at = coalesce(opening_counted_at, now()),
        updated_at = now()
    where id = line_row.id;
  end loop;

  update public.inventory_counts
  set opening_count_completed_at = now(),
      opening_count_completed_by = auth.uid(),
      updated_at = now()
  where id = current_shift.id
  returning * into updated_shift;

  return updated_shift;
end;
$$;

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
  target_counted_stock numeric(12,2);
  final_difference numeric(12,2);
  remaining_quantity numeric(12,2);
  lot_quantity numeric(12,2);
  movement_reason text;
  count_detail text;
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

  if current_shift.status <> 'abierto' then
    raise exception 'Este turno no esta abierto.';
  end if;

  if current_shift.opening_count_completed_at is null then
    raise exception 'Primero confirma el conteo fisico de apertura.';
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
      target_counted_stock := case
        when line_row.counted_by is null then current_item.current_stock
        else line_row.counted_stock
      end;
      final_difference := target_counted_stock - current_item.current_stock;
      count_detail := case
        when final_difference < 0 then format(
          'Conteo de cierre: sistema %s, contado %s, faltante %s',
          current_item.current_stock,
          target_counted_stock,
          abs(final_difference)
        )
        when final_difference > 0 then format(
          'Conteo de cierre: sistema %s, contado %s, sobrante %s',
          current_item.current_stock,
          target_counted_stock,
          abs(final_difference)
        )
        else null
      end;
      movement_reason := concat_ws(
        ' - ',
        'Diferencia en cierre de turno',
        nullif(trim(coalesce(current_shift.shift_name, '')), ''),
        coalesce(nullif(trim(coalesce(line_row.notes, '')), ''), count_detail),
        nullif(trim(coalesce(p_notes, current_shift.notes, '')), '')
      );

      update public.inventory_count_lines
      set expected_stock = current_item.current_stock,
          counted_stock = target_counted_stock,
          difference_stock = final_difference,
          notes = case
            when final_difference <> 0
              then coalesce(nullif(trim(coalesce(notes, '')), ''), count_detail)
            else notes
          end,
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
          target_counted_stock,
          final_difference,
          movement_reason,
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
            from_location_id,
            to_location_id,
            reference,
            reason,
            movement_date,
            item_name_snapshot,
            from_location_snapshot,
            to_location_snapshot,
            created_by
          )
          values (
            current_item.id,
            'conteo',
            remaining_quantity,
            case when final_difference < 0 then current_shift.location_id else null end,
            case when final_difference > 0 then current_shift.location_id else null end,
            current_shift.id::text,
            concat_ws(' - ', movement_reason, 'sin lote identificado'),
            now(),
            current_item.name,
            case when final_difference < 0 then current_location.name else null end,
            case when final_difference > 0 then current_location.name else null end,
            auth.uid()
          );
        end if;
      end if;

      update public.inventory_items
      set current_stock = target_counted_stock,
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

grant execute on function public.confirm_inventory_shift_opening(uuid) to authenticated;
grant execute on function public.close_inventory_shift(uuid, text) to authenticated;

notify pgrst, 'reload schema';
