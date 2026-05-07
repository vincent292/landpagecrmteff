create or replace function public.assign_current_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_row jsonb;
  next_doctor_id uuid;
begin
  next_row := to_jsonb(new);

  if next_row ? 'created_by' and coalesce(next_row->>'created_by', '') = '' then
    next_row := jsonb_set(next_row, '{created_by}', to_jsonb(auth.uid()));
  end if;

  if next_row ? 'uploaded_by' and coalesce(next_row->>'uploaded_by', '') = '' then
    next_row := jsonb_set(next_row, '{uploaded_by}', to_jsonb(auth.uid()));
  end if;

  next_doctor_id := public.current_doctor_profile_id();
  if next_row ? 'doctor_id' and coalesce(next_row->>'doctor_id', '') = '' and next_doctor_id is not null then
    next_row := jsonb_set(next_row, '{doctor_id}', to_jsonb(next_doctor_id));
  end if;

  new := jsonb_populate_record(new, next_row);
  return new;
end;
$$;
