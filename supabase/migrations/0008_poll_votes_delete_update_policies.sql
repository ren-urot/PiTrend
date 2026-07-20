-- The Community Feed & Channels design spec's RLS section states poll_votes
-- should have INSERT/DELETE restricted to the acting user, matching the
-- pattern already applied to likes/bookmarks/channel_subscriptions. The
-- original schema migration (0006) only added SELECT and INSERT for
-- poll_votes, omitting DELETE/UPDATE. Without this, once Plan 2 ships poll
-- voting, a user could cast a vote but never retract or change it (the
-- unique(post_id, voter_id) constraint blocks a second insert).
create policy "Users can update their own poll votes"
  on public.poll_votes for update
  to authenticated
  using (auth.uid() = voter_id)
  with check (auth.uid() = voter_id);

create policy "Users can delete their own poll votes"
  on public.poll_votes for delete
  to authenticated
  using (auth.uid() = voter_id);
