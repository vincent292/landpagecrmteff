drop trigger if exists guard_payment_qr_fields on public.site_settings;

create table if not exists public.site_payment_qr_simple_security (
  id boolean primary key default true,
  password_hash text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_by_email text,
  constraint site_payment_qr_simple_security_singleton check (id)
);

alter table public.site_payment_qr_simple_security enable row level security;

drop policy if exists "Admin read simple payment qr security" on public.site_payment_qr_simple_security;
create policy "Admin read simple payment qr security"
on public.site_payment_qr_simple_security
for select
using (public.is_admin_staff());

drop policy if exists "Superadmin manage simple payment qr security" on public.site_payment_qr_simple_security;
create policy "Superadmin manage simple payment qr security"
on public.site_payment_qr_simple_security
for all
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "Admin insert payment qr audit" on public.site_payment_qr_audit;
create policy "Admin insert payment qr audit"
on public.site_payment_qr_audit
for insert
with check (public.is_admin_staff());

drop policy if exists "Superadmin read payment qr audit" on public.site_payment_qr_audit;
create policy "Superadmin read payment qr audit"
on public.site_payment_qr_audit
for select
using (public.is_superadmin());
