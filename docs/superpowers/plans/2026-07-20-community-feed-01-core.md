# Community Feed & Channels — Plan 1 of 4: Core Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `FeedPage`'s placeholder with a real, working city feed: text and photo posts, likes, bookmarks, and nested comments. This is Plan 1 of 4 implementing the Community Feed & Channels design — poll/video/buy-sell post types, repost/share, channels, and offline drafting are Plans 2-4, built after this one is reviewed and working.

**Architecture:** A normalized Postgres schema (`posts` + per-type extension tables, per the design doc) applied in one migration covering the full design even though this plan's application code only uses a subset of it — avoids repeated schema churn across the four plans. TanStack Query hooks wrap Supabase queries following the exact patterns established in `useProfile`/`useCities`. `posts.author_id` and `comments.author_id` reference `public.profiles(id)` (not `auth.users(id)` directly) specifically so PostgREST can embed author display info in one query rather than N+1 round-trips.

**Tech Stack:** Same as the prior two phases — see `docs/superpowers/plans/2026-07-19-foundation.md`'s Tech Stack section for exact versions. No new npm dependencies this plan.

## Global Constraints

- `posts.city_id` is required (every post belongs to a city); `channel_id` is nullable and unused until Plan 3 (channels).
- `post_type` for this plan is limited to: `text`, `photo`, `question`, `merchant_promo`, `announcement` — all five render identically (optional body + optional single photo), since none of them have extension-table data. `poll`, `video`, `buy_sell`, `repost` are valid per the DB check constraint (created now so later plans don't need a schema migration) but have no UI in this plan.
- Buy & sell price currency will be `'USD' | 'PHP' | 'PI'` when Plan 2 adds it — not relevant to this plan's code, but the schema constraint is created now.
- Comments are nested (`parent_comment_id`), per the design.
- Every task with runtime logic ships with a Vitest test; migration/storage tasks verify via the Supabase dashboard + a REST API check, matching the pattern from the prior two phases.
- Manual Supabase-dashboard steps (applying migrations, creating the Storage bucket) require the user's action — the implementer cannot do these programmatically.
- **This plan changes `FeedPage` from a placeholder to a real page.** `src/routes/FeedPage.test.tsx` and the Feed-related assertion in `src/routes/routes.test.tsx` (currently asserting `'Cebu City Feed — coming soon.'`) will break and MUST be updated in the same task that changes `FeedPage.tsx` (Task 11) — this is a known, anticipated consequence, not something to discover mid-task. See `.superpowers/sdd/progress.md`'s "hidden consumers" pattern from the prior two phases for why this is called out explicitly up front this time.

---

### Task 1: Feed schema migration

**Files:**
- Create: `supabase/migrations/0006_create_feed_schema.sql`

**Interfaces:**
- Produces: `public.channels`, `public.posts`, `public.post_media`, `public.post_polls`, `public.poll_options`, `public.poll_votes`, `public.post_buy_sell`, `public.comments`, `public.likes`, `public.bookmarks`, `public.channel_subscriptions` — all with RLS enabled. Relied on by every later task in this plan and the three follow-up plans.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_create_feed_schema.sql`:

```sql
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
```

- [ ] **Step 2: Apply it to the Supabase project (manual dashboard step)**

Open the Supabase dashboard for `https://puqakbajkmlwohuznxut.supabase.co` → SQL Editor → paste the contents of `supabase/migrations/0006_create_feed_schema.sql` → Run.

- [ ] **Step 3: Verify the tables exist**

In the same SQL Editor, run:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
and table_name in (
  'channels', 'posts', 'post_media', 'post_polls', 'poll_options',
  'poll_votes', 'post_buy_sell', 'comments', 'likes', 'bookmarks',
  'channel_subscriptions'
)
order by table_name;
```

Expected: all 11 table names listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_create_feed_schema.sql
git commit -m "feat: add community feed and channels schema migration"
```

---

### Task 2: post-media Storage bucket

**Files:** None (Supabase dashboard configuration only — no files change).

**Interfaces:**
- Produces: a `post-media` Storage bucket, public read, authenticated write restricted to the uploader's own path prefix. Relied on by Task 5 (`useCreatePost`).

- [ ] **Step 1: Create the bucket (manual dashboard step)**

In the Supabase dashboard: Storage → New bucket → name it `post-media` → set it **Public**.

- [ ] **Step 2: Add the upload policy (manual dashboard step)**

In the SQL Editor, run:

```sql
create policy "Users can upload their own post media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Anyone can read post media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'post-media');
```

This restricts uploads to paths starting with the uploader's own user id (e.g. `post-media/<user-id>/<file>`), matching the path convention `useCreatePost` (Task 5) will use.

- [ ] **Step 3: Verify**

In the SQL Editor, run:

```sql
select policyname from pg_policies where tablename = 'objects' and policyname like '%post media%';
```

Expected: both policy names listed.

- [ ] **Step 4: No commit needed**

This task has no file changes — it's a Supabase-dashboard-only configuration step. Note its completion in the progress ledger as usual, but skip the git commit.

---

### Task 3: Post and Comment types

**Files:**
- Create: `src/types/post.ts`

**Interfaces:**
- Produces: `PostType`, `PostMedia`, `PostAuthor`, `Post`, `Comment` types, consumed by every later task in this plan.

- [ ] **Step 1: Define the types**

Create `src/types/post.ts`:

```ts
export type PostType =
  | 'text'
  | 'photo'
  | 'video'
  | 'poll'
  | 'question'
  | 'buy_sell'
  | 'merchant_promo'
  | 'announcement'
  | 'repost';

export interface PostAuthor {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface PostMedia {
  media_url: string;
  media_type: 'photo' | 'video';
  duration_seconds: number | null;
}

export interface Post {
  id: string;
  author_id: string;
  city_id: string;
  channel_id: string | null;
  post_type: PostType;
  body: string | null;
  shared_post_id: string | null;
  created_at: string;
  author: PostAuthor;
  post_media: PostMedia | null;
  like_count: number;
  comment_count: number;
  viewer_has_liked: boolean;
  viewer_has_bookmarked: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  author: PostAuthor;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: exits 0 (this file has no runtime logic, so there's no test — verification is that it type-checks and nothing imports it yet, so no other errors are introduced).

- [ ] **Step 3: Commit**

```bash
git add src/types/post.ts
git commit -m "feat: add Post and Comment types"
```

---

### Task 4: usePosts hook

**Files:**
- Create: `src/hooks/usePosts.ts`
- Test: `src/hooks/usePosts.test.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`; `Post` type from Task 3; the `posts`/`post_media`/`likes`/`bookmarks` schema from Task 1.
- Produces: `usePosts({ cityId, channelId, viewerId })` — a `useQuery` result keyed `['posts', cityId, channelId]`, returning `Post[]`. Consumed by Task 11 (`FeedPage`).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/usePosts.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePosts } from './usePosts';

const mockPostsData = [
  {
    id: 'post-1',
    author_id: 'user-1',
    city_id: 'city-1',
    channel_id: null,
    post_type: 'text',
    body: 'Hello Cebu!',
    shared_post_id: null,
    created_at: '2026-01-01T00:00:00Z',
    author: { username: 'renz', display_name: 'Ren', avatar_url: null },
    post_media: null,
    likes: [{ count: 2 }],
    comments: [{ count: 1 }],
  },
];

const mockLimit = vi.fn();
const mockOrder = vi.fn(() => ({ limit: mockLimit }));
const mockIs = vi.fn(() => ({ order: mockOrder }));
const mockEqCity = vi.fn(() => ({ is: mockIs }));
const mockSelect = vi.fn(() => ({ eq: mockEqCity }));

const mockLikesIn = vi.fn().mockResolvedValue({ data: [{ post_id: 'post-1' }] });
const mockLikesEq = vi.fn(() => ({ in: mockLikesIn }));
const mockLikesSelect = vi.fn(() => ({ eq: mockLikesEq }));

const mockBookmarksIn = vi.fn().mockResolvedValue({ data: [] });
const mockBookmarksEq = vi.fn(() => ({ in: mockBookmarksIn }));
const mockBookmarksSelect = vi.fn(() => ({ eq: mockBookmarksEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'likes') return { select: mockLikesSelect };
      if (table === 'bookmarks') return { select: mockBookmarksSelect };
      return { select: mockSelect };
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePosts', () => {
  it('returns the city feed with author, media, counts, and viewer flags', async () => {
    mockLimit.mockResolvedValue({ data: mockPostsData, error: null });

    const { result } = renderHook(
      () => usePosts({ cityId: 'city-1', channelId: null, viewerId: 'user-1' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    const post = result.current.data![0];
    expect(post.body).toBe('Hello Cebu!');
    expect(post.author.display_name).toBe('Ren');
    expect(post.like_count).toBe(2);
    expect(post.comment_count).toBe(1);
    expect(post.viewer_has_liked).toBe(true);
    expect(post.viewer_has_bookmarked).toBe(false);

    expect(mockEqCity).toHaveBeenCalledWith('city_id', 'city-1');
    expect(mockIs).toHaveBeenCalledWith('channel_id', null);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/hooks/usePosts.test.tsx`
Expected: FAIL — `src/hooks/usePosts.ts` doesn't exist yet.

- [ ] **Step 3: Implement `usePosts`**

Create `src/hooks/usePosts.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Post } from '../types/post';

interface UsePostsParams {
  cityId: string | undefined;
  channelId: string | null;
  viewerId: string | undefined;
}

export function usePosts({ cityId, channelId, viewerId }: UsePostsParams) {
  return useQuery({
    queryKey: ['posts', cityId, channelId],
    queryFn: async (): Promise<Post[]> => {
      if (!cityId) return [];

      const baseQuery = supabase
        .from('posts')
        .select(
          'id, author_id, city_id, channel_id, post_type, body, shared_post_id, created_at, ' +
            'author:profiles!posts_author_id_fkey(username, display_name, avatar_url), ' +
            'post_media(media_url, media_type, duration_seconds), ' +
            'likes(count), comments(count)'
        );

      const scopedQuery = channelId
        ? baseQuery.eq('channel_id', channelId)
        : baseQuery.eq('city_id', cityId).is('channel_id', null);

      const { data, error } = await scopedQuery.order('created_at', { ascending: false }).limit(20);
      if (error) throw error;

      const rows = data ?? [];
      const postIds = rows.map((row: any) => row.id);

      let likedIds = new Set<string>();
      let bookmarkedIds = new Set<string>();

      if (viewerId && postIds.length > 0) {
        const [{ data: likedRows }, { data: bookmarkedRows }] = await Promise.all([
          supabase.from('likes').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
          supabase.from('bookmarks').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
        ]);
        likedIds = new Set((likedRows ?? []).map((row: any) => row.post_id));
        bookmarkedIds = new Set((bookmarkedRows ?? []).map((row: any) => row.post_id));
      }

      return rows.map((row: any) => ({
        id: row.id,
        author_id: row.author_id,
        city_id: row.city_id,
        channel_id: row.channel_id,
        post_type: row.post_type,
        body: row.body,
        shared_post_id: row.shared_post_id,
        created_at: row.created_at,
        author: row.author,
        post_media: row.post_media ?? null,
        like_count: row.likes?.[0]?.count ?? 0,
        comment_count: row.comments?.[0]?.count ?? 0,
        viewer_has_liked: likedIds.has(row.id),
        viewer_has_bookmarked: bookmarkedIds.has(row.id),
      }));
    },
    enabled: !!cityId,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/hooks/usePosts.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePosts.ts src/hooks/usePosts.test.tsx
git commit -m "feat: add usePosts query hook"
```

---

### Task 5: useCreatePost hook

**Files:**
- Create: `src/hooks/useCreatePost.ts`
- Test: `src/hooks/useCreatePost.test.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`; `post-media` bucket from Task 2.
- Produces: `useCreatePost()` — a `useMutation` accepting `{ authorId, cityId, channelId, postType, body, mediaFile? }`, inserting into `posts` and (if `mediaFile` present) uploading to Storage and inserting into `post_media`. Invalidates `['posts', cityId, channelId]` on success. Consumed by Task 10 (`PostComposer`).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useCreatePost.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreatePost } from './useCreatePost';

const mockPostInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'post-1' }, error: null });
const mockPostInsertSelect = vi.fn(() => ({ single: mockPostInsertSingle }));
const mockPostInsert = vi.fn(() => ({ select: mockPostInsertSelect }));

const mockMediaInsert = vi.fn().mockResolvedValue({ error: null });

const mockUpload = vi.fn().mockResolvedValue({ error: null });
const mockGetPublicUrl = vi.fn(() => ({ data: { publicUrl: 'https://example.com/post-media/user-1/post-1.jpg' } }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'post_media') return { insert: mockMediaInsert };
      return { insert: mockPostInsert };
    },
    storage: {
      from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }),
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCreatePost', () => {
  it('inserts a text post with no media upload', async () => {
    const { result } = renderHook(() => useCreatePost(), { wrapper });

    result.current.mutate({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'text',
      body: 'Hello',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPostInsert).toHaveBeenCalledWith({
      author_id: 'user-1',
      city_id: 'city-1',
      channel_id: null,
      post_type: 'text',
      body: 'Hello',
    });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockMediaInsert).not.toHaveBeenCalled();
  });

  it('uploads media and inserts post_media for a photo post', async () => {
    const { result } = renderHook(() => useCreatePost(), { wrapper });
    const file = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });

    result.current.mutate({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'photo',
      body: null,
      mediaFile: file,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUpload).toHaveBeenCalledWith('user-1/post-1.jpg', file);
    expect(mockMediaInsert).toHaveBeenCalledWith({
      post_id: 'post-1',
      media_url: 'https://example.com/post-media/user-1/post-1.jpg',
      media_type: 'photo',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/hooks/useCreatePost.test.tsx`
Expected: FAIL — `src/hooks/useCreatePost.ts` doesn't exist yet.

- [ ] **Step 3: Implement `useCreatePost`**

Create `src/hooks/useCreatePost.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { PostType } from '../types/post';

interface CreatePostInput {
  authorId: string;
  cityId: string;
  channelId: string | null;
  postType: PostType;
  body: string | null;
  mediaFile?: File;
}

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePostInput) => {
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          author_id: input.authorId,
          city_id: input.cityId,
          channel_id: input.channelId,
          post_type: input.postType,
          body: input.body,
        })
        .select('id')
        .single();
      if (postError) throw postError;

      if (input.mediaFile) {
        const extension = input.mediaFile.name.split('.').pop();
        const path = `${input.authorId}/${post.id}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('post-media')
          .upload(path, input.mediaFile);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('post-media').getPublicUrl(path);

        const { error: mediaError } = await supabase.from('post_media').insert({
          post_id: post.id,
          media_url: publicUrlData.publicUrl,
          media_type: 'photo',
        });
        if (mediaError) throw mediaError;
      }

      return post;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.cityId, variables.channelId] });
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/hooks/useCreatePost.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCreatePost.ts src/hooks/useCreatePost.test.tsx
git commit -m "feat: add useCreatePost mutation hook"
```

---

### Task 6: useToggleLike and useToggleBookmark hooks

**Files:**
- Create: `src/hooks/useToggleLike.ts`, `src/hooks/useToggleBookmark.ts`
- Test: `src/hooks/useToggleLike.test.tsx`, `src/hooks/useToggleBookmark.test.tsx`

**Interfaces:**
- Produces: `useToggleLike()` and `useToggleBookmark()` — `useMutation`s accepting `{ postId, userId, isLiked/isBookmarked, cityId, channelId }`, deleting the row if currently liked/bookmarked, inserting otherwise. Both invalidate `['posts', cityId, channelId]` on success. Consumed by Task 8 (`PostCard`).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useToggleLike.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useToggleLike } from './useToggleLike';

const mockDeleteEqUser = vi.fn().mockResolvedValue({ error: null });
const mockDeleteEqPost = vi.fn(() => ({ eq: mockDeleteEqUser }));
const mockDelete = vi.fn(() => ({ eq: mockDeleteEqPost }));
const mockInsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ delete: mockDelete, insert: mockInsert }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useToggleLike', () => {
  it('inserts a like when not currently liked', async () => {
    const { result } = renderHook(() => useToggleLike(), { wrapper });

    result.current.mutate({
      postId: 'post-1',
      userId: 'user-1',
      isLiked: false,
      cityId: 'city-1',
      channelId: null,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({ post_id: 'post-1', user_id: 'user-1' });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes the like when currently liked', async () => {
    const { result } = renderHook(() => useToggleLike(), { wrapper });

    result.current.mutate({
      postId: 'post-1',
      userId: 'user-1',
      isLiked: true,
      cityId: 'city-1',
      channelId: null,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteEqPost).toHaveBeenCalledWith('post_id', 'post-1');
    expect(mockDeleteEqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

Create `src/hooks/useToggleBookmark.test.tsx` (identical structure, `bookmarks` semantics):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useToggleBookmark } from './useToggleBookmark';

const mockDeleteEqUser = vi.fn().mockResolvedValue({ error: null });
const mockDeleteEqPost = vi.fn(() => ({ eq: mockDeleteEqUser }));
const mockDelete = vi.fn(() => ({ eq: mockDeleteEqPost }));
const mockInsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ delete: mockDelete, insert: mockInsert }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useToggleBookmark', () => {
  it('inserts a bookmark when not currently bookmarked', async () => {
    const { result } = renderHook(() => useToggleBookmark(), { wrapper });

    result.current.mutate({
      postId: 'post-1',
      userId: 'user-1',
      isBookmarked: false,
      cityId: 'city-1',
      channelId: null,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({ post_id: 'post-1', user_id: 'user-1' });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes the bookmark when currently bookmarked', async () => {
    const { result } = renderHook(() => useToggleBookmark(), { wrapper });

    result.current.mutate({
      postId: 'post-1',
      userId: 'user-1',
      isBookmarked: true,
      cityId: 'city-1',
      channelId: null,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteEqPost).toHaveBeenCalledWith('post_id', 'post-1');
    expect(mockDeleteEqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/hooks/useToggleLike.test.tsx src/hooks/useToggleBookmark.test.tsx`
Expected: FAIL — neither hook exists yet.

- [ ] **Step 3: Implement both hooks**

Create `src/hooks/useToggleLike.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface ToggleLikeInput {
  postId: string;
  userId: string;
  isLiked: boolean;
  cityId: string;
  channelId: string | null;
}

export function useToggleLike() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleLikeInput) => {
      if (input.isLiked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('post_id', input.postId)
          .eq('user_id', input.userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({ post_id: input.postId, user_id: input.userId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.cityId, variables.channelId] });
    },
  });
}
```

Create `src/hooks/useToggleBookmark.ts` (identical structure, `bookmarks` table):

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface ToggleBookmarkInput {
  postId: string;
  userId: string;
  isBookmarked: boolean;
  cityId: string;
  channelId: string | null;
}

export function useToggleBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleBookmarkInput) => {
      if (input.isBookmarked) {
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .eq('post_id', input.postId)
          .eq('user_id', input.userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('bookmarks')
          .insert({ post_id: input.postId, user_id: input.userId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.cityId, variables.channelId] });
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/hooks/useToggleLike.test.tsx src/hooks/useToggleBookmark.test.tsx`
Expected: PASS (both files, 2 tests each).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useToggleLike.ts src/hooks/useToggleLike.test.tsx src/hooks/useToggleBookmark.ts src/hooks/useToggleBookmark.test.tsx
git commit -m "feat: add useToggleLike and useToggleBookmark mutation hooks"
```

---

### Task 7: useComments and useCreateComment hooks

**Files:**
- Create: `src/hooks/useComments.ts`, `src/hooks/useCreateComment.ts`
- Test: `src/hooks/useComments.test.tsx`, `src/hooks/useCreateComment.test.tsx`

**Interfaces:**
- Produces: `useComments(postId)` — a `useQuery` keyed `['comments', postId]` returning `Comment[]` (flat list; nesting is reconstructed client-side via `parent_comment_id` by the UI layer in Task 9). `useCreateComment()` — a `useMutation` accepting `{ postId, authorId, parentCommentId, body }`, invalidating `['comments', postId]` on success. Consumed by Task 9 (`CommentThread`).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useComments.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useComments } from './useComments';

const mockOrder = vi.fn();
const mockEq = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useComments', () => {
  it('returns comments for a post ordered oldest first', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'user-1',
          parent_comment_id: null,
          body: 'Nice post!',
          created_at: '2026-01-01T00:00:00Z',
          author: { username: 'renz', display_name: 'Ren', avatar_url: null },
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useComments('post-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].body).toBe('Nice post!');
    expect(mockEq).toHaveBeenCalledWith('post_id', 'post-1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true });
  });
});
```

Create `src/hooks/useCreateComment.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateComment } from './useCreateComment';

const mockInsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: mockInsert }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCreateComment', () => {
  it('inserts a top-level comment', async () => {
    const { result } = renderHook(() => useCreateComment(), { wrapper });

    result.current.mutate({
      postId: 'post-1',
      authorId: 'user-1',
      parentCommentId: null,
      body: 'Great post!',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({
      post_id: 'post-1',
      author_id: 'user-1',
      parent_comment_id: null,
      body: 'Great post!',
    });
  });

  it('inserts a nested reply', async () => {
    const { result } = renderHook(() => useCreateComment(), { wrapper });

    result.current.mutate({
      postId: 'post-1',
      authorId: 'user-2',
      parentCommentId: 'comment-1',
      body: 'I agree!',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({
      post_id: 'post-1',
      author_id: 'user-2',
      parent_comment_id: 'comment-1',
      body: 'I agree!',
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/hooks/useComments.test.tsx src/hooks/useCreateComment.test.tsx`
Expected: FAIL — neither hook exists yet.

- [ ] **Step 3: Implement both hooks**

Create `src/hooks/useComments.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Comment } from '../types/post';

export function useComments(postId: string) {
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('comments')
        .select(
          'id, post_id, author_id, parent_comment_id, body, created_at, ' +
            'author:profiles!comments_author_id_fkey(username, display_name, avatar_url)'
        )
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
    },
  });
}
```

Create `src/hooks/useCreateComment.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface CreateCommentInput {
  postId: string;
  authorId: string;
  parentCommentId: string | null;
  body: string;
}

export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCommentInput) => {
      const { error } = await supabase.from('comments').insert({
        post_id: input.postId,
        author_id: input.authorId,
        parent_comment_id: input.parentCommentId,
        body: input.body,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['comments', variables.postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/hooks/useComments.test.tsx src/hooks/useCreateComment.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useComments.ts src/hooks/useComments.test.tsx src/hooks/useCreateComment.ts src/hooks/useCreateComment.test.tsx
git commit -m "feat: add useComments and useCreateComment hooks"
```

---

### Task 8: PostCard component

**Files:**
- Create: `src/components/feed/PostCard.tsx`
- Test: `src/components/feed/PostCard.test.tsx`

**Interfaces:**
- Consumes: `Post` type (Task 3); `useAuth()` (Foundation); `useToggleLike`/`useToggleBookmark` (Task 6); `CommentThread` (Task 9, stub it first per Step 3 below — Task 9 replaces the stub).
- Produces: `PostCard({ post })`, consumed by Task 11 (`FeedPage`).

- [ ] **Step 1: Write the failing test**

Create `src/components/feed/PostCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostCard } from './PostCard';
import type { Post } from '../../types/post';

const mockToggleLikeMutate = vi.fn();
const mockToggleBookmarkMutate = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../hooks/useToggleLike', () => ({
  useToggleLike: () => ({ mutate: mockToggleLikeMutate }),
}));

vi.mock('../../hooks/useToggleBookmark', () => ({
  useToggleBookmark: () => ({ mutate: mockToggleBookmarkMutate }),
}));

const post: Post = {
  id: 'post-1',
  author_id: 'user-2',
  city_id: 'city-1',
  channel_id: null,
  post_type: 'text',
  body: 'Hello Cebu!',
  shared_post_id: null,
  created_at: '2026-01-01T00:00:00Z',
  author: { username: 'other', display_name: 'Other User', avatar_url: null },
  post_media: null,
  like_count: 3,
  comment_count: 2,
  viewer_has_liked: false,
  viewer_has_bookmarked: false,
};

function renderCard(overrides: Partial<Post> = {}) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <PostCard post={{ ...post, ...overrides }} />
    </QueryClientProvider>
  );
}

describe('PostCard', () => {
  it('renders the post body, author, and like/comment counts', () => {
    renderCard();
    expect(screen.getByText('Hello Cebu!')).toBeInTheDocument();
    expect(screen.getByText('Other User')).toBeInTheDocument();
    expect(screen.getByText('Like (3)')).toBeInTheDocument();
    expect(screen.getByText('Comment (2)')).toBeInTheDocument();
  });

  it('toggles a like when the like button is clicked', async () => {
    renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByText('Like (3)'));

    expect(mockToggleLikeMutate).toHaveBeenCalledWith({
      postId: 'post-1',
      userId: 'user-1',
      isLiked: false,
      cityId: 'city-1',
      channelId: null,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/feed/PostCard.test.tsx`
Expected: FAIL — `src/components/feed/PostCard.tsx` doesn't exist yet.

- [ ] **Step 3: Stub `CommentThread` (Task 9 replaces this with the real component)**

Create `src/components/feed/CommentThread.tsx`:

```tsx
export function CommentThread({ postId }: { postId: string }) {
  return <div data-testid="comment-thread-stub">{postId}</div>;
}
```

- [ ] **Step 4: Implement `PostCard`**

Create `src/components/feed/PostCard.tsx`:

```tsx
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useToggleLike } from '../../hooks/useToggleLike';
import { useToggleBookmark } from '../../hooks/useToggleBookmark';
import { CommentThread } from './CommentThread';
import type { Post } from '../../types/post';

export function PostCard({ post }: { post: Post }) {
  const { session } = useAuth();
  const toggleLike = useToggleLike();
  const toggleBookmark = useToggleBookmark();
  const [showComments, setShowComments] = useState(false);

  const viewerId = session?.user.id;

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm">
          {post.author.display_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium">{post.author.display_name}</p>
          <p className="text-xs text-muted-foreground">@{post.author.username}</p>
        </div>
      </div>

      {post.body && <p className="mb-2 whitespace-pre-wrap">{post.body}</p>}

      {post.post_media && post.post_media.media_type === 'photo' && (
        <img
          src={post.post_media.media_url}
          alt=""
          className="mb-2 max-h-96 w-full rounded-md object-cover"
        />
      )}

      <div className="flex gap-4 text-sm text-muted-foreground">
        <button
          type="button"
          disabled={!viewerId}
          onClick={() =>
            viewerId &&
            toggleLike.mutate({
              postId: post.id,
              userId: viewerId,
              isLiked: post.viewer_has_liked,
              cityId: post.city_id,
              channelId: post.channel_id,
            })
          }
        >
          {post.viewer_has_liked ? 'Liked' : 'Like'} ({post.like_count})
        </button>
        <button type="button" onClick={() => setShowComments((value) => !value)}>
          Comment ({post.comment_count})
        </button>
        <button
          type="button"
          disabled={!viewerId}
          onClick={() =>
            viewerId &&
            toggleBookmark.mutate({
              postId: post.id,
              userId: viewerId,
              isBookmarked: post.viewer_has_bookmarked,
              cityId: post.city_id,
              channelId: post.channel_id,
            })
          }
        >
          {post.viewer_has_bookmarked ? 'Bookmarked' : 'Bookmark'}
        </button>
      </div>

      {showComments && <CommentThread postId={post.id} />}
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/components/feed/PostCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/feed/PostCard.tsx src/components/feed/PostCard.test.tsx src/components/feed/CommentThread.tsx
git commit -m "feat: add PostCard component"
```

---

### Task 9: CommentThread component

**Files:**
- Modify: `src/components/feed/CommentThread.tsx` (replacing the Task 8 stub)
- Test: `src/components/feed/CommentThread.test.tsx`

**Interfaces:**
- Consumes: `useComments`/`useCreateComment` (Task 7); `useAuth()`; `Comment` type (Task 3); `Button`/`Input` from `@/components/ui/*`.
- Produces: the real `CommentThread`, replacing the stub referenced by `src/components/feed/PostCard.tsx` (Task 8).

- [ ] **Step 1: Write the failing test**

Create `src/components/feed/CommentThread.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommentThread } from './CommentThread';
import { useComments } from '../../hooks/useComments';
import { useCreateComment } from '../../hooks/useCreateComment';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../hooks/useComments');
vi.mock('../../hooks/useCreateComment');

const mockUseComments = vi.mocked(useComments);
const mockUseCreateComment = vi.mocked(useCreateComment);
const mockMutateAsync = vi.fn().mockResolvedValue(undefined);

function renderThread() {
  mockUseCreateComment.mockReturnValue({ mutateAsync: mockMutateAsync } as any);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <CommentThread postId="post-1" />
    </QueryClientProvider>
  );
}

describe('CommentThread', () => {
  it('renders top-level comments and their nested replies', () => {
    mockUseComments.mockReturnValue({
      data: [
        {
          id: 'c1',
          post_id: 'post-1',
          author_id: 'user-1',
          parent_comment_id: null,
          body: 'Top level comment',
          created_at: '2026-01-01T00:00:00Z',
          author: { username: 'renz', display_name: 'Ren', avatar_url: null },
        },
        {
          id: 'c2',
          post_id: 'post-1',
          author_id: 'user-2',
          parent_comment_id: 'c1',
          body: 'A nested reply',
          created_at: '2026-01-01T00:01:00Z',
          author: { username: 'other', display_name: 'Other', avatar_url: null },
        },
      ],
      isLoading: false,
    } as any);

    renderThread();

    expect(screen.getByText('Top level comment')).toBeInTheDocument();
    expect(screen.getByText('A nested reply')).toBeInTheDocument();
  });

  it('submits a new top-level comment', async () => {
    mockUseComments.mockReturnValue({ data: [], isLoading: false } as any);
    renderThread();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Write a comment…'), 'My comment');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        postId: 'post-1',
        authorId: 'user-1',
        parentCommentId: null,
        body: 'My comment',
      })
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/feed/CommentThread.test.tsx`
Expected: FAIL — the Task 8 stub only renders a `data-testid="comment-thread-stub"` div, no comment content.

- [ ] **Step 3: Implement the real `CommentThread`**

Replace `src/components/feed/CommentThread.tsx`:

```tsx
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useComments } from '../../hooks/useComments';
import { useCreateComment } from '../../hooks/useCreateComment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Comment } from '../../types/post';

function CommentNode({
  comment,
  allComments,
  postId,
}: {
  comment: Comment;
  allComments: Comment[];
  postId: string;
}) {
  const { session } = useAuth();
  const createComment = useCreateComment();
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');

  const children = allComments.filter((candidate) => candidate.parent_comment_id === comment.id);

  async function submitReply() {
    if (!session || !replyBody.trim()) return;
    await createComment.mutateAsync({
      postId,
      authorId: session.user.id,
      parentCommentId: comment.id,
      body: replyBody.trim(),
    });
    setReplyBody('');
    setReplying(false);
  }

  return (
    <div className="ml-4 border-l pl-3">
      <p className="text-sm font-medium">{comment.author.display_name}</p>
      <p className="text-sm">{comment.body}</p>
      <button type="button" className="text-xs text-muted-foreground" onClick={() => setReplying((v) => !v)}>
        Reply
      </button>
      {replying && (
        <div className="mt-1 flex gap-2">
          <Input
            placeholder="Write a reply…"
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
          />
          <Button type="button" size="sm" onClick={submitReply}>
            Post
          </Button>
        </div>
      )}
      {children.map((child) => (
        <CommentNode key={child.id} comment={child} allComments={allComments} postId={postId} />
      ))}
    </div>
  );
}

export function CommentThread({ postId }: { postId: string }) {
  const { session } = useAuth();
  const { data: comments } = useComments(postId);
  const createComment = useCreateComment();
  const [newBody, setNewBody] = useState('');

  const topLevel = (comments ?? []).filter((comment) => comment.parent_comment_id === null);

  async function submitTopLevel() {
    if (!session || !newBody.trim()) return;
    await createComment.mutateAsync({
      postId,
      authorId: session.user.id,
      parentCommentId: null,
      body: newBody.trim(),
    });
    setNewBody('');
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {topLevel.map((comment) => (
        <CommentNode key={comment.id} comment={comment} allComments={comments ?? []} postId={postId} />
      ))}
      <div className="flex gap-2">
        <Input
          placeholder="Write a comment…"
          value={newBody}
          onChange={(event) => setNewBody(event.target.value)}
        />
        <Button type="button" size="sm" onClick={submitTopLevel}>
          Post
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/feed/CommentThread.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/feed/CommentThread.tsx src/components/feed/CommentThread.test.tsx
git commit -m "feat: add nested CommentThread component"
```

---

### Task 10: PostComposer component

**Files:**
- Create: `src/components/feed/PostComposer.tsx`
- Test: `src/components/feed/PostComposer.test.tsx`

**Interfaces:**
- Consumes: `useAuth()`; `useCreatePost` (Task 5); `Button`/`Input`/`Select*` from `@/components/ui/*`.
- Produces: `PostComposer({ cityId })`, consumed by Task 11 (`FeedPage`).

- [ ] **Step 1: Write the failing test**

Create `src/components/feed/PostComposer.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PostComposer } from './PostComposer';

const mockMutateAsync = vi.fn().mockResolvedValue({ id: 'post-1' });

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../hooks/useCreatePost', () => ({
  useCreatePost: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

describe('PostComposer', () => {
  it('submits a text post with the default type', async () => {
    render(<PostComposer cityId="city-1" />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("What's happening?"), 'Hello Cebu!');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        authorId: 'user-1',
        cityId: 'city-1',
        channelId: null,
        postType: 'text',
        body: 'Hello Cebu!',
        mediaFile: undefined,
      })
    );
  });

  it('shows a file picker only when the photo type is selected', async () => {
    render(<PostComposer cityId="city-1" />);

    expect(screen.queryByLabelText('Photo')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Photo' }));

    expect(screen.getByLabelText('Photo')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/feed/PostComposer.test.tsx`
Expected: FAIL — `src/components/feed/PostComposer.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `PostComposer`**

Create `src/components/feed/PostComposer.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCreatePost } from '../../hooks/useCreatePost';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PostType } from '../../types/post';

const POST_TYPES: { value: PostType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'photo', label: 'Photo' },
  { value: 'question', label: 'Question' },
  { value: 'merchant_promo', label: 'Merchant promotion' },
  { value: 'announcement', label: 'Announcement' },
];

export function PostComposer({ cityId }: { cityId: string }) {
  const { session } = useAuth();
  const createPost = useCreatePost();
  const [postType, setPostType] = useState<PostType>('text');
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | undefined>(undefined);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError('');

    try {
      await createPost.mutateAsync({
        authorId: session.user.id,
        cityId,
        channelId: null,
        postType,
        body: body.trim() || null,
        mediaFile: postType === 'photo' ? mediaFile : undefined,
      });
      setBody('');
      setMediaFile(undefined);
    } catch {
      setError("Couldn't create your post. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2 rounded-lg border p-4">
      <Select value={postType} onValueChange={(value) => setPostType(value as PostType)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {POST_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder="What's happening?"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      {postType === 'photo' && (
        <label className="text-sm">
          Photo
          <input
            type="file"
            accept="image/*"
            aria-label="Photo"
            onChange={(event) => setMediaFile(event.target.files?.[0])}
          />
        </label>
      )}
      <Button type="submit" disabled={createPost.isPending}>
        {createPost.isPending ? 'Posting…' : 'Post'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/feed/PostComposer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/feed/PostComposer.tsx src/components/feed/PostComposer.test.tsx
git commit -m "feat: add PostComposer component"
```

---

### Task 11: Wire up the real FeedPage

**Files:**
- Modify: `src/routes/FeedPage.tsx`, `src/routes/FeedPage.test.tsx`, `src/routes/routes.test.tsx`

**Interfaces:**
- Consumes: `useAuth()`, `useProfile()`, `useCities()` (all existing), `usePosts` (Task 4), `PostComposer` (Task 10), `PostCard` (Task 8).
- Produces: the real city feed at `/feed`, replacing the `ComingSoon` placeholder from the Identity & City Communities phase.

This task deliberately touches `routes.test.tsx` in addition to the two files a narrower brief might list — the prior two phases both had a case where a UI change broke that shared integration test unexpectedly (see the "hidden consumers" lesson from earlier phases). This time it's anticipated and in scope from the start.

- [ ] **Step 1: Replace `FeedPage.test.tsx` first (TDD)**

Replace `src/routes/FeedPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FeedPage } from './FeedPage';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { usePosts } from '../hooks/usePosts';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useProfile');
vi.mock('../hooks/useCities');
vi.mock('../hooks/usePosts');
vi.mock('../hooks/useCreatePost', () => ({
  useCreatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const mockUseProfile = vi.mocked(useProfile);
const mockUseCities = vi.mocked(useCities);
const mockUsePosts = vi.mocked(usePosts);

beforeEach(() => {
  mockUseProfile.mockReturnValue({
    data: {
      id: 'user-1',
      username: 'renz',
      display_name: 'Ren',
      avatar_url: null,
      city_id: 'city-1',
      reputation_score: 0,
      created_at: '2026-01-01',
    },
    isLoading: false,
  } as any);

  mockUseCities.mockReturnValue({
    data: [{ id: 'city-1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines' }],
    isLoading: false,
  } as any);

  mockUsePosts.mockReturnValue({ data: [], isLoading: false } as any);
});

function renderPage() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <FeedPage />
    </QueryClientProvider>
  );
}

describe('FeedPage', () => {
  it('shows the city feed heading and composer once profile/cities have loaded', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Cebu City Feed')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no posts yet', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('No posts yet — be the first to post!')).toBeInTheDocument());
  });

  it('renders post cards when posts are returned', async () => {
    mockUsePosts.mockReturnValue({
      data: [
        {
          id: 'post-1',
          author_id: 'user-1',
          city_id: 'city-1',
          channel_id: null,
          post_type: 'text',
          body: 'Hello Cebu!',
          shared_post_id: null,
          created_at: '2026-01-01T00:00:00Z',
          author: { username: 'renz', display_name: 'Ren', avatar_url: null },
          post_media: null,
          like_count: 0,
          comment_count: 0,
          viewer_has_liked: false,
          viewer_has_bookmarked: false,
        },
      ],
      isLoading: false,
    } as any);

    renderPage();
    await waitFor(() => expect(screen.getByText('Hello Cebu!')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/routes/FeedPage.test.tsx`
Expected: FAIL — `FeedPage` still renders the old `ComingSoon` placeholder, not a heading/composer/post list.

- [ ] **Step 3: Implement the real `FeedPage`**

Replace `src/routes/FeedPage.tsx`:

```tsx
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { usePosts } from '../hooks/usePosts';
import { PostComposer } from '../components/feed/PostComposer';
import { PostCard } from '../components/feed/PostCard';
import { ComingSoon } from '../components/ComingSoon';

export function FeedPage() {
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const { data: cities } = useCities();
  const { data: posts, isLoading } = usePosts({
    cityId: profile?.city_id,
    channelId: null,
    viewerId: session?.user.id,
  });

  const cityName = cities?.find((city) => city.id === profile?.city_id)?.name;

  if (!profile?.city_id) {
    return <ComingSoon title={cityName ? `${cityName} Feed` : 'Feed'} />;
  }

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-xl font-semibold">{cityName} Feed</h1>
      <PostComposer cityId={profile.city_id} />
      {isLoading && <p className="text-muted-foreground">Loading posts…</p>}
      {!isLoading && posts?.length === 0 && (
        <p className="text-muted-foreground">No posts yet — be the first to post!</p>
      )}
      <div className="flex flex-col gap-4">
        {posts?.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/routes/FeedPage.test.tsx`
Expected: PASS (all three tests).

- [ ] **Step 5: Update the broken assertion in `routes.test.tsx`**

`src/routes/routes.test.tsx`'s second test currently asserts `screen.getByText('Cebu City Feed — coming soon.')` after completing onboarding — this text no longer exists once `FeedPage` renders the real composer/feed. That test's mocked `supabase.from()` also has no `'posts'` branch, so the real `FeedPage`'s `usePosts` call would hit the same generic mock shape used for `profiles`/`cities`, which doesn't match what `usePosts` expects (it calls `.select().eq().is().order().limit()`, not `.select().eq().maybeSingle()`).

Add a `'posts'` branch to the mock and update the assertion. In `src/routes/routes.test.tsx`, extend the `from` function inside `vi.mock('../lib/supabase', ...)`:

```ts
    from: (table: string) => {
      if (table === 'cities') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: mockCities, error: null }),
          }),
        };
      }
      if (table === 'posts') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'likes' || table === 'bookmarks') {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [] }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: currentProfile, error: null }),
          }),
        }),
        insert: (row: { id: string; username: string; display_name: string; city_id: string }) => {
          currentProfile = { ...row, avatar_url: null, reputation_score: 0, created_at: '2026-01-01' };
          return Promise.resolve({ error: null });
        },
      };
    },
```

Then update the test's final assertion from:

```ts
    await waitFor(() => expect(screen.getByText('Cebu City Feed — coming soon.')).toBeInTheDocument());
```

to:

```ts
    await waitFor(() => expect(screen.getByText('Cebu City Feed')).toBeInTheDocument());
```

- [ ] **Step 6: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/routes/FeedPage.tsx src/routes/FeedPage.test.tsx src/routes/routes.test.tsx
git commit -m "feat: wire up the real city feed on FeedPage"
```

---

## Self-Review Notes

- **Spec coverage (this plan's scope only):** schema for the full design (Task 1) so Plans 2-4 need no further migrations for the tables themselves; Storage bucket (Task 2); text/photo posts with likes, bookmarks, and nested comments, wired into a real `FeedPage` (Tasks 3-11). Poll/video/buy-sell post types, repost/share, channels, and offline drafting are explicitly out of scope for this plan — see the design doc's Non-Goals and this plan's header for where they land (Plans 2-4).
- **Type consistency verified:** `Post`/`Comment`/`PostAuthor`/`PostMedia` (Task 3) match the columns selected by `usePosts` (Task 4) and `useComments` (Task 7) exactly, and are consumed identically by `PostCard` (Task 8) and `CommentThread` (Task 9). `usePosts`'s `{ cityId, channelId, viewerId }` parameter shape and `useCreatePost`/`useToggleLike`/`useToggleBookmark`'s mutation input shapes are used identically wherever each hook is consumed.
- **Hidden-consumers check applied:** grepped for every existing reference to the old `FeedPage` placeholder behavior before finalizing Task 11 — found and included both `FeedPage.test.tsx` (expected) and `routes.test.tsx` (the one that bit the last two phases unexpectedly) in the same task's authorized file list, with the exact fix already written out rather than left for mid-implementation discovery.
- **No placeholders remain**, other than `CommentThread`'s intentional Task-8-to-Task-9 stub, which follows this project's established stub-then-replace pattern from the Foundation phase's `AppShell`/`ProfilePage` stubs.
