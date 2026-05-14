create or replace function public.get_available_slots(
  p_city text default null,
  p_appointment_type text default null,
  p_date_from date default current_date,
  p_date_to date default current_date + 45,
  p_doctor_id uuid default null,
  p_agenda_tag text default null
)
returns table (
  rule_id uuid,
  doctor_id uuid,
  agenda_tag text,
  date date,
  start_time time,
  end_time time,
  city text,
  location text,
  appointment_type text,
  available_capacity int,
  total_capacity int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d date;
  clean_city text := nullif(lower(trim(coalesce(p_city, ''))), '');
  clean_agenda_tag text := nullif(trim(coalesce(p_agenda_tag, '')), '');
  rule_row public.doctor_availability_rules%rowtype;
  slot_start time;
  slot_end time;
  taken_count int;
  blocked boolean;
begin
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    return;
  end if;

  for d in
    select generate_series(p_date_from, p_date_to, interval '1 day')::date
  loop
    for rule_row in
      select *
      from public.doctor_availability_rules r
      where r.is_active = true
        and (clean_city is null or lower(trim(coalesce(r.city, ''))) = clean_city)
        and (p_appointment_type is null or p_appointment_type = '' or r.appointment_type = p_appointment_type)
        and (p_doctor_id is null or r.doctor_id = p_doctor_id)
        and (
          (clean_agenda_tag is null and r.agenda_tag is null)
          or (clean_agenda_tag is not null and r.agenda_tag = clean_agenda_tag)
        )
        and (
          (r.availability_type = 'specific' and r.specific_date = d)
          or (
            r.availability_type = 'recurring'
            and r.day_of_week = extract(dow from d)::int
            and (r.start_date is null or r.start_date <= d)
            and (r.end_date is null or r.end_date >= d)
          )
        )
    loop
      slot_start := rule_row.start_time;
      loop
        slot_end := ('2000-01-01'::date + slot_start + make_interval(mins => rule_row.slot_duration_minutes))::time;
        exit when slot_end > rule_row.end_time or slot_end <= slot_start;

        if d > current_date or (d = current_date and slot_start > current_time) then
          select exists (
            select 1
            from public.availability_blocks b
            where b.is_active = true
              and b.block_date = d
              and (b.doctor_id is null or b.doctor_id = rule_row.doctor_id)
              and (b.city is null or lower(trim(coalesce(b.city, ''))) = lower(trim(coalesce(rule_row.city, ''))))
              and (
                (b.start_time is null and b.end_time is null)
                or (slot_start < b.end_time and slot_end > b.start_time)
              )
          ) into blocked;

          if not blocked then
            select count(*)::int
            from public.appointment_reservations ar
            where ar.appointment_date = d
              and lower(trim(coalesce(ar.city, ''))) = lower(trim(coalesce(rule_row.city, '')))
              and ar.appointment_type = rule_row.appointment_type
              and ar.start_time = slot_start
              and ar.end_time = slot_end
              and (ar.doctor_id is null or ar.doctor_id = rule_row.doctor_id)
              and ar.status in ('Pendiente', 'Confirmada', 'Realizada')
            into taken_count;

            if taken_count < rule_row.capacity_per_slot then
              rule_id := rule_row.id;
              doctor_id := rule_row.doctor_id;
              agenda_tag := rule_row.agenda_tag;
              date := d;
              start_time := slot_start;
              end_time := slot_end;
              city := rule_row.city;
              location := rule_row.location;
              appointment_type := rule_row.appointment_type;
              available_capacity := rule_row.capacity_per_slot - taken_count;
              total_capacity := rule_row.capacity_per_slot;
              return next;
            end if;
          end if;
        end if;

        slot_start := ('2000-01-01'::date + slot_start + make_interval(mins => rule_row.slot_duration_minutes + rule_row.break_minutes))::time;
      end loop;
    end loop;
  end loop;
end;
$$;

grant execute on function public.get_available_slots(text, text, date, date, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
