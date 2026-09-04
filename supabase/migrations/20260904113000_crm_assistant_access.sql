create or replace function public.is_crm_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('superadmin', 'admin', 'assistant')
  );
$$;

grant execute on function public.is_crm_manager() to authenticated;

notify pgrst, 'reload schema';
