drop policy if exists "Public can create signed urls for private book files" on storage.objects;
create policy "Public can create signed urls for private book files" on storage.objects
for select using (bucket_id = 'book-files-private');
