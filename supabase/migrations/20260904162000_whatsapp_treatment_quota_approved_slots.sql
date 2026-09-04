-- A WhatsApp hold must respect slots already approved from the admin system,
-- not only WhatsApp sessions that are currently awaiting payment/review.
create or replace function public.crm_enforce_treatment_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quota integer := 0;
  occupied integer := 0;
  whatsapp_occupied integer := 0;
  approved_occupied integer := 0;
  was_occupying boolean := false;
  is_occupying boolean := false;
  new_is_assessment boolean := false;
begin
  new_is_assessment := coalesce(new.state_data ->> 'booking_kind', '') = 'assessment';
  is_occupying := new.status in ('awaiting_payment', 'payment_review', 'approved') and not new_is_assessment;
  was_occupying := tg_op = 'UPDATE'
    and old.status in ('awaiting_payment', 'payment_review', 'approved')
    and coalesce(old.state_data ->> 'booking_kind', '') <> 'assessment';
  if not is_occupying or was_occupying then return new; end if;

  select coalesce(available_slots, 0)::integer, coalesce(approved_slots, 0)::integer
  into quota, approved_occupied
  from public.treatments where id = new.treatment_id for update;
  if quota <= 0 then return new; end if;

  perform pg_advisory_xact_lock(hashtext('crm-treatment-quota:' || new.treatment_id::text));
  select count(*)::integer into whatsapp_occupied
  from public.crm_booking_sessions
  where treatment_id = new.treatment_id
    and id <> new.id
    and status in ('awaiting_payment', 'payment_review', 'approved')
    and coalesce(state_data ->> 'booking_kind', '') <> 'assessment';

  occupied := greatest(whatsapp_occupied, approved_occupied);
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
