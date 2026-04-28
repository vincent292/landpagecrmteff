-- Replace this email with the account that should become the first superuser.
-- Run it in Supabase Studio SQL Editor after registering the user.
update public.profiles
set role = 'superadmin'
where id = (
  select id
  from auth.users
  where email = 'tu-correo@ejemplo.com'
  limit 1
);
