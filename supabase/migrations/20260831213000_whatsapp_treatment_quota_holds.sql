-- El límite global del tratamiento se aplica en la base de datos, no en la
-- interfaz. Las conversaciones no consumen cupos: únicamente una retención,
-- comprobante en revisión o reserva aprobada.
create or replace function public.crm_enforce_treatment_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quota integer := 0;
  occupied integer := 0;
  was_occupying boolean := false;
  is_occupying boolean := false;
begin
  is_occupying := new.status in ('awaiting_payment', 'payment_review', 'approved');
  was_occupying := tg_op = 'UPDATE' and old.status in ('awaiting_payment', 'payment_review', 'approved');
  if not is_occupying or was_occupying then return new; end if;

  select coalesce(available_slots, 0)::integer into quota
  from public.treatments where id = new.treatment_id for update;
  if quota <= 0 then return new; end if;

  perform pg_advisory_xact_lock(hashtext('crm-treatment-quota:' || new.treatment_id::text));
  select count(*)::integer into occupied
  from public.crm_booking_sessions
  where treatment_id = new.treatment_id
    and id <> new.id
    and status in ('awaiting_payment', 'payment_review', 'approved');

  if occupied >= quota then
    raise exception 'Este tratamiento ya alcanzó sus % cupos disponibles.', quota;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_booking_enforce_treatment_quota on public.crm_booking_sessions;
create trigger crm_booking_enforce_treatment_quota
before insert or update of status on public.crm_booking_sessions
for each row execute function public.crm_enforce_treatment_quota();

revoke execute on function public.crm_enforce_treatment_quota() from public, anon, authenticated;
