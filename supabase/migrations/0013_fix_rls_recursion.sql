-- Critical live bug found during manual testing of Messaging Plan 1: every
-- policy that checks "is the current user a participant of this
-- conversation" did so with a raw correlated subquery against
-- conversation_participants. Because RLS re-applies a table's OWN
-- policies to any query against that table -- including a subquery
-- embedded inside a DIFFERENT policy -- conversation_participants'
-- self-referential SELECT policy triggered itself recursively every time
-- any of these checks ran, and Postgres raised "infinite recursion
-- detected in policy for relation conversation_participants", which
-- PostgREST surfaced to the client as a bare 500. This broke every
-- messaging read/write path (listing conversations, creating one,
-- sending a message) the moment real HTTP requests hit the live
-- database -- mocked unit tests can't reproduce a live-Postgres-only
-- runtime error like this, which is exactly why this class of bug is
-- called out for live verification, not just review.
--
-- Standard fix (the Supabase-documented pattern for this exact problem):
-- move the participancy check into a SECURITY DEFINER function. A
-- SECURITY DEFINER function runs as its owner (in Supabase, the role
-- that runs SQL-editor migrations, which bypasses RLS), so the query
-- inside the function does NOT re-trigger conversation_participants'
-- policies, breaking the recursion. Callers (RLS policies) invoke the
-- function instead of embedding the raw subquery.

create or replace function public.is_conversation_participant(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id
    and user_id = p_user_id
  );
$$;

revoke all on function public.is_conversation_participant(uuid, uuid) from public;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;

create or replace function public.conversation_participant_count(p_conversation_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer from public.conversation_participants
  where conversation_id = p_conversation_id;
$$;

revoke all on function public.conversation_participant_count(uuid) from public;
grant execute on function public.conversation_participant_count(uuid) to authenticated;

-- conversations: SELECT policy queried conversation_participants directly.
drop policy "Participants can read their conversations" on public.conversations;

create policy "Participants can read their conversations"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_participant(conversations.id, auth.uid()));

-- conversation_participants: SELECT/INSERT/DELETE policies were all
-- self-referential. UPDATE is untouched (it only checks user_id =
-- auth.uid(), never queries conversation_participants, so it was never
-- part of the recursion).
drop policy "Participants can read their conversations' participant lists" on public.conversation_participants;

create policy "Participants can read their conversations' participant lists"
  on public.conversation_participants for select
  to authenticated
  using (public.is_conversation_participant(conversation_participants.conversation_id, auth.uid()));

drop policy "Users can add themselves to a brand-new conversation or be added by a fellow participant" on public.conversation_participants;

create policy "Users can add themselves to a brand-new conversation or be added by a fellow participant"
  on public.conversation_participants for insert
  to authenticated
  with check (
    (
      user_id = auth.uid()
      and public.conversation_participant_count(conversation_id) = 0
    )
    or public.is_conversation_participant(conversation_id, auth.uid())
  );

drop policy "Participants can remove themselves or others from conversations they're in" on public.conversation_participants;

create policy "Participants can remove themselves or others from conversations they're in"
  on public.conversation_participants for delete
  to authenticated
  using (public.is_conversation_participant(conversation_participants.conversation_id, auth.uid()));

-- messages: SELECT/INSERT policies both queried conversation_participants
-- directly.
drop policy "Participants can read messages in their conversations" on public.messages;

create policy "Participants can read messages in their conversations"
  on public.messages for select
  to authenticated
  using (public.is_conversation_participant(messages.conversation_id, auth.uid()));

drop policy "Participants can send messages in their conversations" on public.messages;

create policy "Participants can send messages in their conversations"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_participant(messages.conversation_id, auth.uid())
  );
