drop policy if exists "Authenticated upload payment receipts" on storage.objects;
create policy "Authenticated upload payment receipts" on storage.objects
for insert with check (bucket_id = 'payment-receipts-private');

drop policy if exists "Authenticated update own payment receipts" on storage.objects;
create policy "Authenticated update own payment receipts" on storage.objects
for update using (bucket_id = 'payment-receipts-private')
with check (bucket_id = 'payment-receipts-private');
