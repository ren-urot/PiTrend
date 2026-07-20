-- Requires the message-media Storage bucket to already exist (created via
-- the Supabase dashboard: Storage -> New bucket -> name it "message-media"
-- -> set it Public), and requires public.conversation_participants (from
-- 0010_create_messaging_schema.sql) to already exist for the EXISTS check
-- below to resolve.

create policy "Participants can upload media to their conversations"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-media'
    and exists (
      select 1 from public.conversation_participants
      where conversation_participants.conversation_id = ((storage.foldername(name))[1])::uuid
      and conversation_participants.user_id = auth.uid()
    )
  );

create policy "Anyone can read message media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'message-media');
