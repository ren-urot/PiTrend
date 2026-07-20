-- 0010's "Users can add themselves or be added by a fellow participant"
-- policy had an unconditional `user_id = auth.uid()` branch, letting any
-- authenticated user insert themselves into ANY existing conversation
-- whose id they possess (not just the brand-new conversation they're
-- creating) -- broader than the design intended (only existing
-- participants may add new members; there's no self-join/invite-link
-- flow in this plan). Conversation ids are unguessable gen_random_uuid()s
-- and no shipped code path exploits this, but it's a real gap worth
-- closing rather than leaving mis-described.
--
-- Fix: the self-add branch now only applies when the conversation
-- currently has ZERO participants -- i.e. you're the creator inserting
-- yourself as the very first participant right after creating the
-- conversation row. Joining an existing (non-empty) conversation still
-- requires being added by an existing participant (second branch,
-- unchanged).
drop policy "Users can add themselves or be added by a fellow participant" on public.conversation_participants;

create policy "Users can add themselves to a brand-new conversation or be added by a fellow participant"
  on public.conversation_participants for insert
  to authenticated
  with check (
    (
      user_id = auth.uid()
      and not exists (
        select 1 from public.conversation_participants as existing
        where existing.conversation_id = conversation_participants.conversation_id
      )
    )
    or exists (
      select 1 from public.conversation_participants as self
      where self.conversation_id = conversation_participants.conversation_id
      and self.user_id = auth.uid()
    )
  );
