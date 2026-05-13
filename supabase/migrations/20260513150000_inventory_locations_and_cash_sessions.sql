create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  description text,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_role text,
  deleted_by_name text,
  deleted_by_email text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_locations_deleted_idx on public.inventory_locations(is_deleted, is_active);

create trigger inventory_locations_touch_updated_at
before update on public.inventory_locations
for each row
execute function public.set_row_updated_at();

alter table public.inventory_items
  add column if not exists location_id uuid references public.inventory_locations(id) on delete set null;

alter table public.inventory_adjustments
  add column if not exists location_name_snapshot text;

update public.inventory_adjustments adjustments
set location_name_snapshot = locations.name
from public.inventory_items items
left join public.inventory_locations locations on locations.id = items.location_id
where adjustments.item_id = items.id
  and adjustments.location_name_snapshot is null;

create index if not exists inventory_items_location_idx on public.inventory_items(location_id);

create table if not exists public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null default current_date,
  city text,
  location_name text,
  opening_amount numeric(12,2) not null default 0,
  opening_notes text,
  status text not null default 'abierta',
  opened_by uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  closing_expected_amount numeric(12,2),
  closing_counted_amount numeric(12,2),
  closing_difference_amount numeric(12,2),
  closing_notes text,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_role text,
  deleted_by_name text,
  deleted_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_register_sessions_status_check check (status in ('abierta', 'cerrada'))
);

create unique index if not exists cash_register_sessions_open_unique
on public.cash_register_sessions(session_date, coalesce(city, ''), coalesce(location_name, ''))
where status = 'abierta' and is_deleted = false;

create index if not exists cash_register_sessions_date_idx on public.cash_register_sessions(session_date desc);
create index if not exists cash_register_sessions_deleted_idx on public.cash_register_sessions(is_deleted, status);

create trigger cash_register_sessions_touch_updated_at
before update on public.cash_register_sessions
for each row
execute function public.set_row_updated_at();

alter table public.cash_movements
  add column if not exists register_session_id uuid references public.cash_register_sessions(id) on delete set null;

create index if not exists cash_movements_session_idx on public.cash_movements(register_session_id, movement_date desc);

alter table public.inventory_locations enable row level security;
alter table public.cash_register_sessions enable row level security;

drop policy if exists "Staff manage inventory locations" on public.inventory_locations;
create policy "Staff manage inventory locations"
on public.inventory_locations
for all
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "Admin staff manage cash register sessions" on public.cash_register_sessions;
create policy "Admin staff manage cash register sessions"
on public.cash_register_sessions
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

create or replace function public.close_cash_register_session(
  p_session_id uuid,
  p_counted_amount numeric,
  p_notes text default null
)
returns public.cash_register_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_session public.cash_register_sessions%rowtype;
  movements_total numeric(12,2);
  expected_total numeric(12,2);
  updated_session public.cash_register_sessions%rowtype;
begin
  if auth.uid() is null or not public.is_admin_staff() then
    raise exception 'Solo administracion puede cerrar caja.';
  end if;

  if p_counted_amount is null then
    raise exception 'Debes indicar el monto contado.';
  end if;

  select *
  into current_session
  from public.cash_register_sessions
  where id = p_session_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'No encontramos la apertura de caja.';
  end if;

  if current_session.status = 'cerrada' then
    return current_session;
  end if;

  select coalesce(sum(case when movement_type = 'ingreso' then amount else -amount end), 0)
  into movements_total
  from public.cash_movements
  where register_session_id = current_session.id
    and is_deleted = false
    and status <> 'anulado';

  expected_total := current_session.opening_amount + movements_total;

  update public.cash_register_sessions
  set status = 'cerrada',
      closing_expected_amount = expected_total,
      closing_counted_amount = p_counted_amount,
      closing_difference_amount = p_counted_amount - expected_total,
      closing_notes = nullif(trim(coalesce(p_notes, '')), ''),
      closed_by = auth.uid(),
      closed_at = now(),
      updated_at = now()
  where id = current_session.id
  returning *
  into updated_session;

  return updated_session;
end;
$$;
