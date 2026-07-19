# PiMesh — Community Feed & Channels Design

Date: 2026-07-20
Status: Approved

## Context

This is sub-project #3 of PiMesh's 8-phase decomposition (see the Foundation
and Identity & City Communities design docs for the first two phases, both
complete). The Foundation phase shipped auth/profiles/app shell; Identity &
City Communities added the `cities` table and mandatory city membership.
This phase replaces the `FeedPage` placeholder with a real, typed community
feed, plus a channels/subscriptions system layered on top of it.

Per the user's explicit choice, this phase covers the PRD's full Community
Feed (section 9) and Community Channels (section 11) scope in one design —
not narrowed to a smaller first pass. Given the resulting size, the
implementation is expected to span multiple sequential plan documents under
this one design (decided at the writing-plans stage), the way the PRD itself
was decomposed into multiple sub-projects under one product vision.

## Goals

- Nine post types: text, photo, video, poll, question, buy & sell,
  merchant promotion, announcement, repost (share).
- Like, comment (nested replies), bookmark, share (repost) on every post.
- Channels: global or city-scoped, with subscribe/unsubscribe.
- Full offline-first post drafting, including media, queued for upload when
  connectivity returns.
- Buy & sell posts carry real structured fields (price, currency, category)
  now, since a later sub-project (#5, Marketplace & Merchant Directory)
  builds its structured listings on top of this data rather than starting
  from scratch.

## Non-Goals (explicitly deferred)

- Channel creation/management UI — channels are seeded data for this phase,
  the same way `cities` was seeded data in sub-project #2. Real channel
  administration belongs to sub-project #8 (Moderation & Roles).
- Cross-city feed browsing — Phase 3 of the PRD's own roadmap, not this
  sub-project.
- Video transcoding/compression — raw upload only, with a client-enforced
  size/duration cap (no server-side processing pipeline).
- Post editing — delete-your-own-post is in scope, editing after creation
  is not.
- The full Marketplace/Merchant Directory experience (ratings, in-app chat
  button, seller profile pages) — sub-project #5 builds on `post_buy_sell`'s
  fields but the structured marketplace itself doesn't exist yet.
- Moderation of `announcement`/other post types by role (no roles exist
  yet — sub-project #8) — any authenticated user can currently choose any
  post type, including `announcement`.

## Architecture

### Data model

Base `posts` table plus per-type extension tables — normalized rather than
one wide table with nullable columns, per the user's explicit choice. Not
every `post_type` gets its own extension table: only `poll` and `buy_sell`
have genuinely distinct structured data. `question`, `merchant_promo`, and
`announcement` are just `post_type` tags reusing `body` and the optional
`post_media` extension (no PRD-specified structured fields beyond what
text/photo posts already have — inventing fields here would be scope creep
ahead of sub-project #5).

```sql
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
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

create table public.post_media (
  post_id uuid primary key references public.posts(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('photo', 'video')),
  duration_seconds integer
);

create table public.post_polls (
  post_id uuid primary key references public.posts(id) on delete cascade
);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  option_text text not null,
  display_order integer not null
);

create table public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  poll_option_id uuid not null references public.poll_options(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, voter_id)
);

create table public.post_buy_sell (
  post_id uuid primary key references public.posts(id) on delete cascade,
  price_amount numeric not null,
  price_currency text not null check (price_currency in ('USD', 'PHP', 'PI')),
  category text not null
);
```

Reposts (the "Share" action) are `posts` rows with `post_type = 'repost'`
and `shared_post_id` set to the original post — no separate `shares` table.
This keeps the feed a single chronological query over `posts` rather than a
union of two tables, and "un-sharing" is just deleting your own repost row
(the same delete-your-own-post capability every post type gets).

```sql
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.bookmarks (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  city_id uuid references public.cities(id),
  description text,
  created_at timestamptz not null default now()
);

create table public.channel_subscriptions (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
```

`channels.city_id` is nullable: null means global (Pi Official, Pi
Developers), set means city-specific (Cebu Community). Users see all global
channels plus channels for their own city.

### Row Level Security

Consistent with the existing `cities`/`profiles` pattern (permissive read,
ownership-restricted write):

- `posts`, `post_media`, `post_polls`, `poll_options`, `post_buy_sell`,
  `comments`: SELECT for all authenticated users; INSERT/UPDATE/DELETE
  restricted to the row's owner (`author_id` = `auth.uid()`, or derived
  through the parent `post_id` for extension tables).
- `likes`, `bookmarks`, `poll_votes`, `channel_subscriptions`: SELECT for
  all authenticated users (needed to compute counts/tallies client-side);
  INSERT/DELETE restricted to the acting user (`user_id`/`voter_id` =
  `auth.uid()`).
- `channels`: SELECT for `anon` + `authenticated` (public reference data,
  same as `cities`). No client INSERT/UPDATE/DELETE policy — channels are
  seeded via migration, the same way `cities` was seeded in sub-project #2.
  Real channel management is sub-project #8.

### Offline drafting & sync

The most complex piece of this phase, since the user chose full offline
drafting including queued media uploads (not just text-only offline
drafts).

**Dexie (IndexedDB) layer** — a new `draftPosts` table alongside Foundation's
existing `queryCache` table in the same Dexie database:

```ts
interface DraftPost {
  id: string; // local uuid
  postType: PostType;
  cityId: string;
  channelId: string | null;
  body: string | null;
  pollOptions?: string[];
  buySell?: { priceAmount: number; priceCurrency: 'USD' | 'PHP' | 'PI'; category: string };
  mediaBlobs?: { blob: Blob; mediaType: 'photo' | 'video' }[];
  status: 'queued' | 'syncing' | 'failed';
  lastError: string | null;
  createdAt: string;
}
```

**Sync flow:**

1. Composing a post (online or offline — same code path) writes a
   `draftPosts` row immediately. The composer's own feed view shows queued
   drafts optimistically with a "sending…" badge, merged with the real
   `posts` query results client-side.
2. `processQueue()`: for each `queued` draft, uploads any `mediaBlobs` to
   the `post-media` Storage bucket first (getting back public URLs), then
   inserts the real row into `posts` plus the relevant extension table via
   the Supabase client, then deletes the local draft on success. On
   failure, sets `status: 'failed'` with `lastError`, retryable by the user.
3. `processQueue()` runs once on app load (catches drafts stranded from a
   previous offline session) and again every time Foundation's
   `useOnlineStatus()` hook transitions from offline to online.
4. Drafts are per-device — Dexie is local to the browser, matching
   Foundation's existing offline model (the persisted TanStack Query cache
   is also per-device, not synced across a user's devices).

### Storage

A `post-media` Supabase Storage bucket: public read, authenticated write
restricted to the uploader's own path prefix
(`post-media/{user_id}/{uuid}.{ext}`) — the same per-user ownership pattern
RLS already uses elsewhere in this app. Client-enforced caps (not
server-validated in this phase): images capped at a reasonable file size,
videos capped at 60 seconds / 50MB.

### Feed queries

- **City feed** (replaces `FeedPage`'s "coming soon" placeholder): `posts`
  where `city_id = <user's city>` and `channel_id is null`, ordered by
  `created_at desc`, cursor-paginated with a "load more" control (infinite
  scroll is a nice-to-have, not required this phase).
- **Channel feed** (`ChannelPage`, new route `/channels/:slug`): same query
  shape, filtered by `channel_id` instead of `city_id`/`channel_id is null`.
- Each post card's extension-table data (media/poll options and current
  tallies/buy-sell fields) and interaction counts (likes/comments/shares)
  are fetched via joined queries per page of posts, not per-post
  round-trips (avoiding N+1).

### UI / Routes

- `FeedPage` (existing route, currently a placeholder) becomes the real
  city feed: a post composer plus the post list.
- New `ChannelsPage` (`/channels`): directory of global + the user's city's
  channels, with subscribe/unsubscribe.
- New `ChannelPage` (`/channels/:slug`): that channel's own feed, same post
  card rendering as the city feed.
- Post composer: post-type selector, then type-specific fields (media
  picker for photo/video, option inputs for poll, price/currency/category
  for buy & sell).
- Post card: renders per `post_type`, with like/comment/bookmark/share
  actions and a nested-reply comment thread.

### Testing

Same approach as the first two phases: Vitest + mocked Supabase client per
hook/component. Given this phase's size, the implementation plan(s) will
need to decide test coverage task-by-task rather than enumerate every case
here — but the offline sync queue (`processQueue()`) specifically needs
tests covering: successful sync of a text draft, a media draft (upload then
insert), a failed sync leaving the draft queued/retryable, and the
online-transition trigger.

## Open questions / risks

- **Plan size**: this design's full scope is large enough that a single
  implementation plan would likely need 25-35+ tasks, well past the
  granularity that's worked well for the first two phases (15 and 8 tasks
  respectively). The writing-plans step for this sub-project should split
  it into multiple sequential plan documents (e.g. schema + core text/photo
  posts + interactions; then poll/buy-sell/video post types; then channels
  + offline sync queue) rather than one giant plan — decided at
  planning time, not prescribed here.
- **Storage bucket creation**: like every Supabase schema change so far in
  this project, creating the `post-media` bucket and its policies is a
  manual dashboard step the user must perform — the implementer cannot
  create Storage buckets programmatically without dashboard/CLI credentials
  this project doesn't have configured.
- **Offline media queue complexity**: storing `Blob`s in Dexie and
  resuming a multi-step upload-then-insert sequence across app restarts is
  the most technically ambitious piece of this phase (more so than
  anything in Foundation or Identity & City Communities). It should get
  its own careful task breakdown and thorough testing rather than being
  folded into a broader "add posts" task.
