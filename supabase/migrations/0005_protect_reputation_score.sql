-- reputation_score has no legitimate client-writable path yet (no scoring
-- logic exists until a later phase), but the existing profiles UPDATE policy
-- is row-scoped only (auth.uid() = id), not column-scoped — so a user could
-- currently set their own reputation_score to anything via a direct update.
-- This trigger unconditionally preserves the prior value on every update,
-- regardless of what a client attempts to set, until real scoring logic
-- replaces it with a privileged write path.
create or replace function public.protect_reputation_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.reputation_score := old.reputation_score;
  return new;
end;
$$;

create trigger protect_reputation_score
  before update on public.profiles
  for each row
  execute function public.protect_reputation_score();
