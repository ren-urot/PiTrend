-- Allows unauthenticated visitors to view a shared profile link (/u/:username,
-- the QR-code destination) without an account. Read-only; insert/update remain
-- restricted to the authenticated owner via the existing policies.
create policy "Anonymous users can read all profiles"
  on public.profiles for select
  to anon
  using (true);
