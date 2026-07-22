create table public.connections (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

alter table public.connections enable row level security;

create policy "Authenticated users can read all connections"
  on public.connections for select
  to authenticated
  using (true);

create policy "Users can create their own connections"
  on public.connections for insert
  to authenticated
  with check (auth.uid() = follower_id);

create policy "Users can remove their own connections"
  on public.connections for delete
  to authenticated
  using (auth.uid() = follower_id);

create index connections_follower_idx on public.connections (follower_id);
create index connections_followed_idx on public.connections (followed_id);
