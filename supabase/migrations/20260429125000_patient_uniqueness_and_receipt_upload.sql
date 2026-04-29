delete from public.patients a
using public.patients b
where a.profile_id is not null
  and a.profile_id = b.profile_id
  and a.created_at > b.created_at;

create unique index if not exists patients_profile_id_unique_idx
on public.patients(profile_id)
where profile_id is not null;

drop policy if exists "Authenticated upload payment receipts" on storage.objects;
create policy "Authenticated upload payment receipts" on storage.objects
for insert with check (bucket_id = 'payment-receipts-private' and auth.uid() is not null);

drop policy if exists "Authenticated update own payment receipts" on storage.objects;
create policy "Authenticated update own payment receipts" on storage.objects
for update using (bucket_id = 'payment-receipts-private' and auth.uid() is not null)
with check (bucket_id = 'payment-receipts-private' and auth.uid() is not null);
