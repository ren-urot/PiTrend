create policy "Users can upload their own marketplace media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'marketplace-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Anyone can read marketplace media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'marketplace-media');
