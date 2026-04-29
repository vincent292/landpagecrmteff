drop policy if exists "Receipt owners and staff read payment receipts" on storage.objects;
create policy "Receipt owners and staff read payment receipts" on storage.objects
for select using (
  bucket_id = 'payment-receipts-private'
  and (
    public.is_staff()
    or exists (
      select 1
      from public.book_orders bo
      where bo.payment_receipt_path = storage.objects.name
        and bo.user_id = auth.uid()
    )
  )
);
