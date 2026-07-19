create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  city_id uuid references public.cities(id),
  description text,
  created_at timestamptz not null default now()
);

alter table public.channels enable row level security;

create policy "Anyone can read channels"
  on public.channels for select
  to anon, authenticated
  using (true);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  city_id uuid not null references public.cities(id),
  channel_id uuid references public.channels(id),
  post_type text not null check (post_type in (
    'text', 'photo', 'video', 'poll', 'question',
    'buy_sell', 'merchant_promo', 'announcement', 'repost'
  )),
  body text,
  shared_post_id uuid references public.posts(id),
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

create policy "Authenticated users can read all posts"
  on public.posts for select
  to authenticated
  using (true);

create policy "Users can insert their own posts"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "Users can delete their own posts"
  on public.posts for delete
  to authenticated
  using (auth.uid() = author_id);

create index posts_city_feed_idx on public.posts (city_id, created_at desc) where channel_id is null;
create index posts_channel_feed_idx on public.posts (channel_id, created_at desc) where channel_id is not null;

create table public.post_media (
  post_id uuid primary key references public.posts(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('photo', 'video')),
  duration_seconds integer
);

alter table public.post_media enable row level security;

create policy "Authenticated users can read all post media"
  on public.post_media for select
  to authenticated
  using (true);

create policy "Users can insert media for their own posts"
  on public.post_media for insert
  to authenticated
  with check (
    exists (select 1 from public.posts where posts.id = post_id and posts.author_id = auth.uid())
  );

create table public.post_polls (
  post_id uuid primary key references public.posts(id) on delete cascade
);

alter table public.post_polls enable row level security;

create policy "Authenticated users can read all polls"
  on public.post_polls for select
  to authenticated
  using (true);

create policy "Users can insert polls for their own posts"
  on public.post_polls for insert
  to authenticated
  with check (
    exists (select 1 from public.posts where posts.id = post_id and posts.author_id = auth.uid())
  );

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  option_text text not null,
  display_order integer not null
);

alter table public.poll_options enable row level security;

create policy "Authenticated users can read all poll options"
  on public.poll_options for select
  to authenticated
  using (true);

create policy "Users can insert options for their own polls"
  on public.poll_options for insert
  to authenticated
  with check (
    exists (select 1 from public.posts where posts.id = post_id and posts.author_id = auth.uid())
  );

create table public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  poll_option_id uuid not null references public.poll_options(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, voter_id)
);

alter table public.poll_votes enable row level security;

create policy "Authenticated users can read all poll votes"
  on public.poll_votes for select
  to authenticated
  using (true);

create policy "Users can insert their own poll votes"
  on public.poll_votes for insert
  to authenticated
  with check (auth.uid() = voter_id);

create table public.post_buy_sell (
  post_id uuid primary key references public.posts(id) on delete cascade,
  price_amount numeric not null,
  price_currency text not null check (price_currency in ('USD', 'PHP', 'PI')),
  category text not null
);

alter table public.post_buy_sell enable row level security;

create policy "Authenticated users can read all buy & sell details"
  on public.post_buy_sell for select
  to authenticated
  using (true);

create policy "Users can insert buy & sell details for their own posts"
  on public.post_buy_sell for insert
  to authenticated
  with check (
    exists (select 1 from public.posts where posts.id = post_id and posts.author_id = auth.uid())
  );

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create policy "Authenticated users can read all comments"
  on public.comments for select
  to authenticated
  using (true);

create policy "Users can insert their own comments"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "Users can delete their own comments"
  on public.comments for delete
  to authenticated
  using (auth.uid() = author_id);

create table public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.likes enable row level security;

create policy "Authenticated users can read all likes"
  on public.likes for select
  to authenticated
  using (true);

create policy "Users can insert their own likes"
  on public.likes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own likes"
  on public.likes for delete
  to authenticated
  using (auth.uid() = user_id);

create table public.bookmarks (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.bookmarks enable row level security;

create policy "Authenticated users can read all bookmarks"
  on public.bookmarks for select
  to authenticated
  using (true);

create policy "Users can insert their own bookmarks"
  on public.bookmarks for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own bookmarks"
  on public.bookmarks for delete
  to authenticated
  using (auth.uid() = user_id);

create table public.channel_subscriptions (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

alter table public.channel_subscriptions enable row level security;

create policy "Authenticated users can read all channel subscriptions"
  on public.channel_subscriptions for select
  to authenticated
  using (true);

create policy "Users can insert their own channel subscriptions"
  on public.channel_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own channel subscriptions"
  on public.channel_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);
