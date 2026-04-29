alter table public.treatments add column if not exists city text;

alter table public.information_requests alter column whatsapp drop not null;
alter table public.information_requests alter column interest drop not null;

drop policy if exists "Visitors create information requests" on public.information_requests;
create policy "Visitors create information requests" on public.information_requests
for insert with check (true);
