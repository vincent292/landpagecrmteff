drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Staff manage profiles" on public.profiles;
drop policy if exists "Staff can manage profiles" on public.profiles;
drop policy if exists "Staff can read profiles" on public.profiles;
drop policy if exists "Superadmin can manage profiles" on public.profiles;

create policy "Staff can read profiles"
on public.profiles
for select
using (public.is_staff());

create policy "Superadmin can manage profiles"
on public.profiles
for all
using (public.is_superadmin())
with check (public.is_superadmin());
