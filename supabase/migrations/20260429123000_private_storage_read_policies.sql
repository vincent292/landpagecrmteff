drop policy if exists "Patients read visible clinical photos storage" on storage.objects;
create policy "Patients read visible clinical photos storage" on storage.objects
for select using (
  bucket_id = 'patient-photos-private'
  and exists (
    select 1
    from public.patient_photos pp
    join public.patients p on p.id = pp.patient_id
    where pp.image_path = storage.objects.name
      and pp.is_visible_to_patient = true
      and p.profile_id = auth.uid()
  )
);

drop policy if exists "Token owners read private book files storage" on storage.objects;
create policy "Token owners read private book files storage" on storage.objects
for select using (
  bucket_id = 'book-files-private'
  and exists (
    select 1
    from public.book_download_tokens t
    join public.books b on b.id = t.book_id
    where b.file_path = storage.objects.name
      and t.user_id = auth.uid()
      and t.is_active = true
      and t.used_count < t.max_uses
      and (t.expires_at is null or t.expires_at > now())
  )
);
