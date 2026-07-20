# Community Feed & Channels — Plan 3 of 4: Repost/Share and Channels

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Share" interaction (repost) to every post, and a channels system (directory, subscribe/unsubscribe, per-channel feeds reusing the existing composer/post-card). Offline drafting remains Plan 4.

**Architecture:** Reposting is a `posts` row with `post_type: 'repost'` and `shared_post_id` set to the original (per Plan 1's schema and the design doc) — no new table. `usePosts` grows a third self-referential embed (`posts` → `posts` via `shared_post_id`) to fetch a lightweight preview of the shared post alongside a repost. Channels reuse `PostComposer`/`PostCard`/`usePosts` unchanged in their core logic — a channel feed is just `usePosts({ cityId, channelId: <real channel id>, viewerId })` instead of `channelId: null`, and `PostComposer` gains an optional `channelId` prop (defaulting to `null`, preserving every existing caller's behavior).

**Tech Stack:** Same as Plans 1-2 — no new npm dependencies.

## Global Constraints

- Reposting is insert-only from the composer's perspective — there is no "Buy & Sell"-style form for it; it's a one-click action on an existing post's Share button.
- Sharing a repost creates a repost pointing at that repost's own id (not at the original post transitively) — matches the design's literal `shared_post_id` semantics; no chain-flattening. This is a deliberate YAGNI choice, not an oversight.
- A channel post still requires `city_id` (the poster's own city) — schema-enforced (`posts.city_id not null`) since Plan 1. `channels.city_id` (nullable) is a property of the *channel*, unrelated to what city a post *in* that channel is tagged with.
- The channel directory shows global channels (`city_id is null`) plus channels for the viewer's own city — matches the approved design ("Users see all global channels plus channels for their own city").
- Every task with runtime logic ships with a Vitest test.
- **Report filenames:** this plan's task numbering restarts at 1, and every earlier plan/phase in this project has already used `task-N-report.md` for unrelated tasks. Use `task-N-report-plan3.md` for every task in this plan, per the convention established in Plan 2.
- **Self-referential embed uses the column-name hint, not the constraint-name hint.** Task 1's `posts` → `posts` embed is `shared_post:posts!shared_post_id(...)`, not `shared_post:posts!posts_shared_post_id_fkey(...)` (the constraint-name form used for every other embed in `usePosts.ts`). A live sanity-check against the Supabase REST API found the constraint-name form returns `PGRST200` ("could not find a relationship") for this specific self-referential FK, even though the constraint exists and the column-name form resolves correctly — verified live with the exact shipped select string. If a future plan adds another self-referential embed, use the column-name hint form from the start rather than rediscovering this.
- **No channels are seeded by this plan.** The `channels` table has zero rows in the live database — this plan ships the UI/hooks, but `ChannelsPage` will show an empty directory until channels are manually seeded (a follow-up manual step, analogous to how `cities` was seeded in Identity & City Communities — not included here since the PRD's example channel list, e.g. "Pi Official", "Pi Developers", "Cebu Community", wasn't part of what was scoped for this plan's brainstorming). Flag this to the user after implementation; don't silently seed channels without asking, since it's a content decision, not a code one.

---

### Task 1: Extend `Post` type and `usePosts` for shared-post previews

**Files:**
- Modify: `src/types/post.ts`, `src/hooks/usePosts.ts`, `src/hooks/usePosts.test.tsx`

**Interfaces:**
- Produces: `SharedPostAuthor` (`{ username, display_name, avatar_url }`), `SharedPost` (`{ id, post_type, body, author, post_media }`) types; `Post` gains `shared_post: SharedPost | null`. Relied on by Task 3 (`PostCard`'s repost rendering).

- [ ] **Step 1: Extend the types**

Modify `src/types/post.ts` — add after `PostAuthor`:

```ts
export interface SharedPostAuthor {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface SharedPost {
  id: string;
  post_type: PostType;
  body: string | null;
  author: SharedPostAuthor;
  post_media: PostMedia | null;
}
```

And add one field to `Post`, immediately after `shared_post_id: string | null;`:

```ts
  shared_post: SharedPost | null;
```

- [ ] **Step 2: Replace the failing test first**

Replace `src/hooks/usePosts.test.tsx`:

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
    post_type: 'repost',
    body: null,
    shared_post_id: 'post-original',
    created_at: '2026-01-03T00:00:00Z',
    author: { username: 'renz', display_name: 'Ren', avatar_url: null },
    post_media: null,
    poll_options: [],
    post_buy_sell: null,
    shared_post: {
      id: 'post-original',
      post_type: 'text',
      body: 'The original post',
      author: { username: 'other', display_name: 'Other', avatar_url: null },
      post_media: null,
    },
    likes: [{ count: 0 }],
    comments: [{ count: 0 }],
  },
  {
    id: 'post-2',
    author_id: 'user-2',
    city_id: 'city-1',
    channel_id: null,
    post_type: 'repost',
    body: null,
    shared_post_id: 'post-deleted',
    created_at: '2026-01-04T00:00:00Z',
    author: { username: 'other2', display_name: 'Other Two', avatar_url: null },
    post_media: null,
    poll_options: [],
    post_buy_sell: null,
    shared_post: null,
    likes: [{ count: 0 }],
    comments: [{ count: 0 }],
  },
];

const mockLimit = vi.fn();
const mockOrder = vi.fn(() => ({ limit: mockLimit }));
const mockIs = vi.fn(() => ({ order: mockOrder }));
const mockEqCity = vi.fn(() => ({ is: mockIs }));
const mockSelect = vi.fn(() => ({ eq: mockEqCity }));

const mockLikesIn = vi.fn().mockResolvedValue({ data: [] });
const mockLikesEq = vi.fn(() => ({ in: mockLikesIn }));
const mockLikesSelect = vi.fn(() => ({ eq: mockLikesEq }));

const mockBookmarksIn = vi.fn().mockResolvedValue({ data: [] });
const mockBookmarksEq = vi.fn(() => ({ in: mockBookmarksIn }));
const mockBookmarksSelect = vi.fn(() => ({ eq: mockBookmarksEq }));

const mockVotesIn = vi.fn().mockResolvedValue({ data: [] });
const mockVotesEq = vi.fn(() => ({ in: mockVotesIn }));
const mockVotesSelect = vi.fn(() => ({ eq: mockVotesEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'likes') return { select: mockLikesSelect };
      if (table === 'bookmarks') return { select: mockBookmarksSelect };
      if (table === 'poll_votes') return { select: mockVotesSelect };
      return { select: mockSelect };
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePosts', () => {
  it('returns the shared-post preview for a repost, or null if the original is gone', async () => {
    mockLimit.mockResolvedValue({ data: mockPostsData, error: null });

    const { result } = renderHook(
      () => usePosts({ cityId: 'city-1', channelId: null, viewerId: undefined }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [repostWithOriginal, repostWithDeletedOriginal] = result.current.data!;

    expect(repostWithOriginal.shared_post).toEqual({
      id: 'post-original',
      post_type: 'text',
      body: 'The original post',
      author: { username: 'other', display_name: 'Other', avatar_url: null },
      post_media: null,
    });
    expect(repostWithDeletedOriginal.shared_post).toBeNull();

    expect(mockSelect).toHaveBeenCalledWith(
      'id, author_id, city_id, channel_id, post_type, body, shared_post_id, created_at, ' +
        'author:profiles!posts_author_id_fkey(username, display_name, avatar_url), ' +
        'post_media(media_url, media_type, duration_seconds), ' +
        'poll_options(id, option_text, display_order, poll_votes(count)), ' +
        'post_buy_sell(price_amount, price_currency, category), ' +
        'shared_post:posts!shared_post_id(id, post_type, body, ' +
        'author:profiles!posts_author_id_fkey(username, display_name, avatar_url), ' +
        'post_media(media_url, media_type, duration_seconds)), ' +
        'likes(count), comments(count)'
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- src/hooks/usePosts.test.tsx`
Expected: FAIL — the current `usePosts.ts` doesn't select or map `shared_post`, and `Post` doesn't have that field yet (also a type error).

- [ ] **Step 4: Extend `usePosts`**

Modify `src/hooks/usePosts.ts` — add this segment to the select string, immediately after the `post_buy_sell(...)` line and before `likes(count), comments(count)`:

```ts
            'shared_post:posts!shared_post_id(id, post_type, body, ' +
              'author:profiles!posts_author_id_fkey(username, display_name, avatar_url), ' +
              'post_media(media_url, media_type, duration_seconds)), ' +
```

And add one field to the row-mapping object, immediately after `shared_post_id: row.shared_post_id,`:

```ts
        shared_post: row.shared_post ?? null,
```

(The rest of `usePosts.ts` — the city/channel branching, the likes/bookmarks/poll-votes follow-up queries, the poll/buy_sell mapping from Plan 2 — is unchanged.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/hooks/usePosts.test.tsx`
Expected: PASS.

- [ ] **Step 6: Sanity-check the self-referential embed against the live database (manual, best-effort)**

Use the Supabase dashboard's API docs page (or a direct `curl` against the REST endpoint, whichever is more convenient) to try a `GET /rest/v1/posts?select=id,shared_post:posts!shared_post_id(id,body)` call against the live project. Confirm it returns without a PostgREST relationship/schema error (an empty or null-`shared_post` result is fine — there's no repost data yet since `useCreatePost`'s repost path doesn't exist until Task 2). If it errors, stop and report — this embed shape needs reconsidering before later tasks build on it.

- [ ] **Step 7: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS (add `shared_post: null` to any `Post`-shaped test fixture that fails to type-check as a result of this change — grep for `viewer_has_bookmarked` across `src/` to find them all, the same way Plan 2's Task 1 did for `poll`/`buy_sell`), build exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/types/post.ts src/hooks/usePosts.ts src/hooks/usePosts.test.tsx
git commit -m "feat: extend Post type and usePosts for shared-post previews"
```

---

### Task 2: `useCreateRepost` hook

**Files:**
- Create: `src/hooks/useCreateRepost.ts`
- Test: `src/hooks/useCreateRepost.test.tsx`

**Interfaces:**
- Produces: `useCreateRepost()` — a `useMutation` accepting `{ authorId, cityId, channelId, sharedPostId }`, inserting a `posts` row with `post_type: 'repost'`, `body: null`, `shared_post_id: sharedPostId`, invalidating `['posts', cityId, channelId]` on success. Consumed by Task 3 (`PostCard`'s Share button).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useCreateRepost.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateRepost } from './useCreateRepost';

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

describe('useCreateRepost', () => {
  it('inserts a repost referencing the shared post', async () => {
    const { result } = renderHook(() => useCreateRepost(), { wrapper });

    result.current.mutate({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      sharedPostId: 'post-original',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({
      author_id: 'user-1',
      city_id: 'city-1',
      channel_id: null,
      post_type: 'repost',
      body: null,
      shared_post_id: 'post-original',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/hooks/useCreateRepost.test.tsx`
Expected: FAIL — `src/hooks/useCreateRepost.ts` doesn't exist yet.

- [ ] **Step 3: Implement `useCreateRepost`**

Create `src/hooks/useCreateRepost.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface CreateRepostInput {
  authorId: string;
  cityId: string;
  channelId: string | null;
  sharedPostId: string;
}

export function useCreateRepost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateRepostInput) => {
      const { error } = await supabase.from('posts').insert({
        author_id: input.authorId,
        city_id: input.cityId,
        channel_id: input.channelId,
        post_type: 'repost',
        body: null,
        shared_post_id: input.sharedPostId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.cityId, variables.channelId] });
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/hooks/useCreateRepost.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCreateRepost.ts src/hooks/useCreateRepost.test.tsx
git commit -m "feat: add useCreateRepost mutation hook"
```

---

### Task 3: Add the Share button and repost rendering to `PostCard`

**Files:**
- Modify: `src/components/feed/PostCard.tsx`, `src/components/feed/PostCard.test.tsx`

**Interfaces:**
- Consumes: `useCreateRepost` (Task 2); `Post.shared_post` (Task 1).
- Produces: `PostCard` shows a "🔁 shared a post" label plus an inline preview card when `post.post_type === 'repost'` (or "This post is no longer available." if `shared_post` is null), and a functional Share button alongside Like/Comment/Bookmark on every post.

- [ ] **Step 1: Extend the failing test first**

Modify `src/components/feed/PostCard.test.tsx` — add `shared_post: null` to the base `post` fixture (alongside the existing `poll: null, buy_sell: null`), add a `useCreateRepost` mock alongside the file's existing `useToggleLike`/`useToggleBookmark`/`useVoteOnPoll` mocks:

```tsx
const mockCreateRepostMutate = vi.fn();

vi.mock('../../hooks/useCreateRepost', () => ({
  useCreateRepost: () => ({ mutate: mockCreateRepostMutate }),
}));
```

And add these test cases inside the `describe` block:

```tsx
  it('shares a post when the Share button is clicked', async () => {
    renderCard();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(mockCreateRepostMutate).toHaveBeenCalledWith({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      sharedPostId: 'post-1',
    });
  });

  it('renders a shared-post preview for a repost', () => {
    renderCard({
      post_type: 'repost',
      body: null,
      shared_post: {
        id: 'post-original',
        post_type: 'text',
        body: 'The original post',
        author: { username: 'other', display_name: 'Other', avatar_url: null },
        post_media: null,
      },
    });

    expect(screen.getByText('shared a post', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('The original post')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('shows a fallback when the shared post is no longer available', () => {
    renderCard({ post_type: 'repost', body: null, shared_post: null });

    expect(screen.getByText('This post is no longer available.')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test -- src/components/feed/PostCard.test.tsx`
Expected: the existing tests PASS (once the fixture has `shared_post: null` added to satisfy the type); the three new tests FAIL — no Share button or repost rendering exists yet.

- [ ] **Step 3: Extend `PostCard`**

Modify `src/components/feed/PostCard.tsx` — add the `useCreateRepost` import, and add this block immediately after the author-info `<div>` and before the existing `{post.body && ...}` line:

```tsx
      {post.post_type === 'repost' && (
        <div className="mb-2">
          <p className="mb-1 text-xs text-muted-foreground">🔁 shared a post</p>
          {post.shared_post ? (
            <div className="rounded-md border p-2">
              <p className="text-xs font-medium">{post.shared_post.author.display_name}</p>
              {post.shared_post.body && <p className="text-sm">{post.shared_post.body}</p>}
              {post.shared_post.post_media && post.shared_post.post_media.media_type === 'photo' && (
                <img
                  src={post.shared_post.post_media.media_url}
                  alt=""
                  className="mt-1 max-h-64 w-full rounded object-cover"
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This post is no longer available.</p>
          )}
        </div>
      )}
```

Add the `useCreateRepost` hook call alongside the existing `toggleLike`/`toggleBookmark` calls:

```ts
  const createRepost = useCreateRepost();
```

And add a Share button to the actions row, between the Comment and Bookmark buttons:

```tsx
        <button
          type="button"
          disabled={!viewerId}
          onClick={() =>
            viewerId &&
            createRepost.mutate({
              authorId: viewerId,
              cityId: post.city_id,
              channelId: post.channel_id,
              sharedPostId: post.id,
            })
          }
        >
          Share
        </button>
```

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `npm test -- src/components/feed/PostCard.test.tsx`
Expected: PASS (all tests, Plan 1/2's original tests plus these three new ones).

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/feed/PostCard.tsx src/components/feed/PostCard.test.tsx
git commit -m "feat: add Share button and repost rendering to PostCard"
```

---

### Task 4: Channel type and hooks

**Files:**
- Create: `src/types/channel.ts`, `src/hooks/useChannels.ts`, `src/hooks/useChannels.test.tsx`, `src/hooks/useChannelSubscriptions.ts`, `src/hooks/useChannelSubscriptions.test.tsx`, `src/hooks/useToggleChannelSubscription.ts`, `src/hooks/useToggleChannelSubscription.test.tsx`

**Interfaces:**
- Produces: `Channel` type (`{ id, name, slug, city_id, description }`); `useChannels()` — a `useQuery` keyed `['channels']` returning all channels ordered by name; `useChannelSubscriptions(userId)` — a `useQuery` keyed `['channel-subscriptions', userId]` returning the viewer's subscribed channel ids as `string[]`; `useToggleChannelSubscription()` — a `useMutation` toggling `channel_subscriptions`, invalidating `['channel-subscriptions', userId]`. Consumed by Task 6 (`ChannelsPage`) and Task 7 (`ChannelPage`).

- [ ] **Step 1: Define the `Channel` type**

Create `src/types/channel.ts`:

```ts
export interface Channel {
  id: string;
  name: string;
  slug: string;
  city_id: string | null;
  description: string | null;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/hooks/useChannels.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useChannels } from './useChannels';

const mockOrder = vi.fn();
const mockSelect = vi.fn(() => ({ order: mockOrder }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useChannels', () => {
  it('returns channels ordered by name', async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: 'ch-1', name: 'Pi Official', slug: 'pi-official', city_id: null, description: null },
        { id: 'ch-2', name: 'Cebu Community', slug: 'cebu-community', city_id: 'city-1', description: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useChannels(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(mockSelect).toHaveBeenCalledWith('id, name, slug, city_id, description');
    expect(mockOrder).toHaveBeenCalledWith('name', { ascending: true });
  });
});
```

Create `src/hooks/useChannelSubscriptions.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useChannelSubscriptions } from './useChannelSubscriptions';

const mockEq = vi.fn();
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

describe('useChannelSubscriptions', () => {
  it('returns the subscribed channel ids for the given user', async () => {
    mockEq.mockResolvedValue({ data: [{ channel_id: 'ch-1' }, { channel_id: 'ch-2' }], error: null });

    const { result } = renderHook(() => useChannelSubscriptions('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(['ch-1', 'ch-2']);
    expect(mockSelect).toHaveBeenCalledWith('channel_id');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
```

Create `src/hooks/useToggleChannelSubscription.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useToggleChannelSubscription } from './useToggleChannelSubscription';

const mockDeleteEqUser = vi.fn().mockResolvedValue({ error: null });
const mockDeleteEqChannel = vi.fn(() => ({ eq: mockDeleteEqUser }));
const mockDelete = vi.fn(() => ({ eq: mockDeleteEqChannel }));
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

describe('useToggleChannelSubscription', () => {
  it('inserts a subscription when not currently subscribed', async () => {
    const { result } = renderHook(() => useToggleChannelSubscription(), { wrapper });

    result.current.mutate({ channelId: 'ch-1', userId: 'user-1', isSubscribed: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({ channel_id: 'ch-1', user_id: 'user-1' });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes the subscription when currently subscribed', async () => {
    const { result } = renderHook(() => useToggleChannelSubscription(), { wrapper });

    result.current.mutate({ channelId: 'ch-1', userId: 'user-1', isSubscribed: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteEqChannel).toHaveBeenCalledWith('channel_id', 'ch-1');
    expect(mockDeleteEqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test -- src/hooks/useChannels.test.tsx src/hooks/useChannelSubscriptions.test.tsx src/hooks/useToggleChannelSubscription.test.tsx`
Expected: FAIL — none of the three hooks exist yet.

- [ ] **Step 4: Implement all three hooks**

Create `src/hooks/useChannels.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Channel } from '../types/channel';

export function useChannels() {
  return useQuery({
    queryKey: ['channels'],
    queryFn: async (): Promise<Channel[]> => {
      const { data, error } = await supabase
        .from('channels')
        .select('id, name, slug, city_id, description')
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });
}
```

Create `src/hooks/useChannelSubscriptions.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useChannelSubscriptions(userId: string | undefined) {
  return useQuery({
    queryKey: ['channel-subscriptions', userId],
    queryFn: async (): Promise<string[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('channel_subscriptions')
        .select('channel_id')
        .eq('user_id', userId);
      if (error) throw error;
      return (data ?? []).map((row: any) => row.channel_id);
    },
    enabled: !!userId,
  });
}
```

Create `src/hooks/useToggleChannelSubscription.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface ToggleChannelSubscriptionInput {
  channelId: string;
  userId: string;
  isSubscribed: boolean;
}

export function useToggleChannelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleChannelSubscriptionInput) => {
      if (input.isSubscribed) {
        const { error } = await supabase
          .from('channel_subscriptions')
          .delete()
          .eq('channel_id', input.channelId)
          .eq('user_id', input.userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('channel_subscriptions')
          .insert({ channel_id: input.channelId, user_id: input.userId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['channel-subscriptions', variables.userId] });
    },
  });
}
```

- [ ] **Step 5: Run the tests to verify they all pass**

Run: `npm test -- src/hooks/useChannels.test.tsx src/hooks/useChannelSubscriptions.test.tsx src/hooks/useToggleChannelSubscription.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/channel.ts src/hooks/useChannels.ts src/hooks/useChannels.test.tsx src/hooks/useChannelSubscriptions.ts src/hooks/useChannelSubscriptions.test.tsx src/hooks/useToggleChannelSubscription.ts src/hooks/useToggleChannelSubscription.test.tsx
git commit -m "feat: add channel type and hooks"
```

---

### Task 5: Add an optional `channelId` prop to `PostComposer`

**Files:**
- Modify: `src/components/feed/PostComposer.tsx`

**Interfaces:**
- Produces: `PostComposer({ cityId, channelId? })` — `channelId` defaults to `null`, preserving every existing caller's behavior unchanged (Plan 1/2's `FeedPage` passes only `cityId`). Consumed by Task 7 (`ChannelPage`, which passes a real `channelId`).

- [ ] **Step 1: Make the change**

Modify `src/components/feed/PostComposer.tsx` — change the function signature:

```ts
export function PostComposer({ cityId, channelId = null }: { cityId: string; channelId?: string | null }) {
```

And change the `mutateAsync` call's `channelId: null,` line to:

```ts
        channelId,
```

- [ ] **Step 2: Verify no regression**

Run: `npm test -- src/components/feed/PostComposer.test.tsx`
Expected: PASS — Plan 1/2's existing tests call `<PostComposer cityId="city-1" />` with no `channelId`, so it defaults to `null`, identical to the pre-change hardcoded behavior. No test file changes needed for this task.

- [ ] **Step 3: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/feed/PostComposer.tsx
git commit -m "feat: add optional channelId prop to PostComposer"
```

---

### Task 6: `ChannelsPage` (directory) and nav

**Files:**
- Create: `src/routes/ChannelsPage.tsx`, `src/routes/ChannelsPage.test.tsx`
- Modify: `src/components/nav/AppShell.tsx`, `src/components/nav/AppShell.test.tsx`, `src/routes/routes.tsx`

**Interfaces:**
- Consumes: `useAuth()`, `useProfile()`, `useChannels`/`useChannelSubscriptions`/`useToggleChannelSubscription` (Task 4).
- Produces: `ChannelsPage` at `/channels`, listing global channels plus the viewer's own city's channels, each with a subscribe/unsubscribe button and a link to `/channels/:slug` (Task 7 implements that route's page). Adds a "Channels" tab to `AppShell`'s navigation.

This task deliberately touches `AppShell.test.tsx` in its authorized file list — adding a nav tab breaks its "renders all five nav tabs" assertion (now six), the same anticipated-not-discovered pattern used for `routes.test.tsx` in Plan 1's Task 11.

- [ ] **Step 1: Write the failing `ChannelsPage` test**

Create `src/routes/ChannelsPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ChannelsPage } from './ChannelsPage';
import { useChannels } from '../hooks/useChannels';
import { useChannelSubscriptions } from '../hooks/useChannelSubscriptions';
import { useToggleChannelSubscription } from '../hooks/useToggleChannelSubscription';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useProfile', () => ({
  useProfile: () => ({
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
  }),
}));

vi.mock('../hooks/useChannels');
vi.mock('../hooks/useChannelSubscriptions');
vi.mock('../hooks/useToggleChannelSubscription');

const mockUseChannels = vi.mocked(useChannels);
const mockUseChannelSubscriptions = vi.mocked(useChannelSubscriptions);
const mockUseToggleChannelSubscription = vi.mocked(useToggleChannelSubscription);
const mockToggleMutate = vi.fn();

function renderPage() {
  mockUseChannels.mockReturnValue({
    data: [
      { id: 'ch-1', name: 'Pi Official', slug: 'pi-official', city_id: null, description: null },
      { id: 'ch-2', name: 'Cebu Community', slug: 'cebu-community', city_id: 'city-1', description: null },
      { id: 'ch-3', name: 'Manila Events', slug: 'manila-events', city_id: 'city-manila', description: null },
    ],
    isLoading: false,
  } as any);
  mockUseChannelSubscriptions.mockReturnValue({ data: ['ch-1'], isLoading: false } as any);
  mockUseToggleChannelSubscription.mockReturnValue({ mutate: mockToggleMutate } as any);

  render(
    <MemoryRouter>
      <ChannelsPage />
    </MemoryRouter>
  );
}

describe('ChannelsPage', () => {
  it('shows global channels and the viewer\'s own city\'s channels, not other cities\'', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Pi Official')).toBeInTheDocument());
    expect(screen.getByText('Cebu Community')).toBeInTheDocument();
    expect(screen.queryByText('Manila Events')).not.toBeInTheDocument();
  });

  it('shows Subscribed for a channel the viewer is already subscribed to', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Subscribed')).toBeInTheDocument());
    expect(screen.getByText('Subscribe')).toBeInTheDocument();
  });

  it('toggles a subscription when the button is clicked', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Subscribe')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByText('Subscribe'));

    expect(mockToggleMutate).toHaveBeenCalledWith({
      channelId: 'ch-2',
      userId: 'user-1',
      isSubscribed: false,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/routes/ChannelsPage.test.tsx`
Expected: FAIL — `src/routes/ChannelsPage.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `ChannelsPage`**

Create `src/routes/ChannelsPage.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useChannels } from '../hooks/useChannels';
import { useChannelSubscriptions } from '../hooks/useChannelSubscriptions';
import { useToggleChannelSubscription } from '../hooks/useToggleChannelSubscription';
import { Button } from '@/components/ui/button';

export function ChannelsPage() {
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const { data: channels } = useChannels();
  const { data: subscribedIds } = useChannelSubscriptions(session?.user.id);
  const toggleSubscription = useToggleChannelSubscription();

  const viewerId = session?.user.id;
  const visibleChannels = channels?.filter(
    (channel) => channel.city_id === null || channel.city_id === profile?.city_id
  );

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Channels</h1>
      <div className="flex flex-col gap-2">
        {visibleChannels?.map((channel) => {
          const isSubscribed = subscribedIds?.includes(channel.id) ?? false;
          return (
            <div key={channel.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Link to={`/channels/${channel.slug}`} className="font-medium hover:underline">
                  {channel.name}
                </Link>
                {channel.description && (
                  <p className="text-sm text-muted-foreground">{channel.description}</p>
                )}
              </div>
              <Button
                type="button"
                variant={isSubscribed ? 'outline' : 'default'}
                size="sm"
                disabled={!viewerId}
                onClick={() =>
                  viewerId &&
                  toggleSubscription.mutate({
                    channelId: channel.id,
                    userId: viewerId,
                    isSubscribed,
                  })
                }
              >
                {isSubscribed ? 'Subscribed' : 'Subscribe'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/routes/ChannelsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Extend the failing `AppShell` test first**

Modify `src/components/nav/AppShell.test.tsx` — rename the test from `'renders all five nav tabs and the active route content'` to `'renders all six nav tabs and the active route content'`, and add one more assertion inside it:

```tsx
    expect(screen.getAllByText('Channels').length).toBeGreaterThan(0);
```

(Add this line alongside the existing `getAllByText('Feed')`/`'Messages'`/etc. assertions.)

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- src/components/nav/AppShell.test.tsx`
Expected: FAIL — no "Channels" tab exists yet.

- [ ] **Step 7: Add the nav tab**

Modify `src/components/nav/AppShell.tsx` — add `Hash` to the `lucide-react` import and add a tab entry:

```ts
import { Newspaper, MessageCircle, Store, Rss, User, Hash } from 'lucide-react';

const tabs = [
  { to: '/feed', label: 'Feed', icon: Rss },
  { to: '/channels', label: 'Channels', icon: Hash },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/profile', label: 'Profile', icon: User },
];
```

(Only the import line and the `tabs` array change — the rest of `AppShell.tsx` is unchanged.)

- [ ] **Step 8: Wire the route**

Modify `src/routes/routes.tsx` — add the import and a route entry inside the `AppShell` children array, alongside `/feed`:

```ts
import { ChannelsPage } from './ChannelsPage';
```

```ts
          { path: '/channels', element: <ChannelsPage /> },
```

- [ ] **Step 9: Run the tests to verify they all pass**

Run: `npm test -- src/components/nav/AppShell.test.tsx src/routes/ChannelsPage.test.tsx`
Expected: PASS.

- [ ] **Step 10: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 11: Commit**

```bash
git add src/routes/ChannelsPage.tsx src/routes/ChannelsPage.test.tsx src/components/nav/AppShell.tsx src/components/nav/AppShell.test.tsx src/routes/routes.tsx
git commit -m "feat: add ChannelsPage directory and Channels nav tab"
```

---

### Task 7: `ChannelPage` (per-channel feed)

**Files:**
- Create: `src/routes/ChannelPage.tsx`, `src/routes/ChannelPage.test.tsx`
- Modify: `src/routes/routes.tsx`

**Interfaces:**
- Consumes: `useAuth()`, `useProfile()`, `useChannels` (Task 4), `usePosts` (Task 1's extended version), `PostComposer` (Task 5's extended version, passing a real `channelId`), `PostCard`.
- Produces: `ChannelPage` at `/channels/:slug` — the channel's own feed, reusing the same composer/post-card as the city feed.

- [ ] **Step 1: Write the failing test**

Create `src/routes/ChannelPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ChannelPage } from './ChannelPage';
import { useChannels } from '../hooks/useChannels';
import { usePosts } from '../hooks/usePosts';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useProfile', () => ({
  useProfile: () => ({
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
  }),
}));

vi.mock('../hooks/useChannels');
vi.mock('../hooks/usePosts');
vi.mock('../hooks/useCreatePost', () => ({
  useCreatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const mockUseChannels = vi.mocked(useChannels);
const mockUsePosts = vi.mocked(usePosts);

function renderAt(path: string) {
  mockUseChannels.mockReturnValue({
    data: [{ id: 'ch-1', name: 'Pi Official', slug: 'pi-official', city_id: null, description: null }],
    isLoading: false,
  } as any);
  mockUsePosts.mockReturnValue({ data: [], isLoading: false } as any);

  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/channels/:slug" element={<ChannelPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ChannelPage', () => {
  it('shows the channel name and composer once the channel resolves', async () => {
    renderAt('/channels/pi-official');
    await waitFor(() => expect(screen.getByText('Pi Official')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
  });

  it('queries posts scoped to the resolved channel id, not the null city-feed scope', async () => {
    renderAt('/channels/pi-official');
    await waitFor(() =>
      expect(mockUsePosts).toHaveBeenCalledWith(
        expect.objectContaining({ channelId: 'ch-1', viewerId: 'user-1' })
      )
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/routes/ChannelPage.test.tsx`
Expected: FAIL — `src/routes/ChannelPage.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `ChannelPage`**

Create `src/routes/ChannelPage.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useChannels } from '../hooks/useChannels';
import { usePosts } from '../hooks/usePosts';
import { PostComposer } from '../components/feed/PostComposer';
import { PostCard } from '../components/feed/PostCard';

export function ChannelPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const { data: channels } = useChannels();
  const channel = channels?.find((candidate) => candidate.slug === slug);

  const { data: posts, isLoading } = usePosts({
    cityId: channel ? profile?.city_id : undefined,
    channelId: channel?.id ?? null,
    viewerId: session?.user.id,
  });

  if (!channel) {
    return <div className="p-6 text-muted-foreground">Loading channel…</div>;
  }

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-xl font-semibold">{channel.name}</h1>
      {profile?.city_id && <PostComposer cityId={profile.city_id} channelId={channel.id} />}
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

Note: `cityId: channel ? profile?.city_id : undefined` deliberately withholds `cityId` (keeping `usePosts` disabled) until `channel` has resolved — this avoids a transient window where `channelId` is `null` (because `channel` hasn't loaded yet) and `usePosts` would otherwise fall into its city-feed branch instead of staying idle. This doesn't require any change to `usePosts` itself.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/routes/ChannelPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the route**

Modify `src/routes/routes.tsx` — add the import and a route entry inside the `AppShell` children array, alongside `/channels`:

```ts
import { ChannelPage } from './ChannelPage';
```

```ts
          { path: '/channels/:slug', element: <ChannelPage /> },
```

- [ ] **Step 6: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/routes/ChannelPage.tsx src/routes/ChannelPage.test.tsx src/routes/routes.tsx
git commit -m "feat: add ChannelPage per-channel feed"
```

---

## Self-Review Notes

- **Spec coverage (this plan's scope only):** Share/repost (post-as-repost, no new table, shared-post preview rendering with a graceful "no longer available" fallback) and channels (directory scoped to global + viewer's city, subscribe/unsubscribe, per-channel feed reusing the composer/post-card) — both fully wired end-to-end. Offline drafting remains Plan 4's scope, per the design doc and this plan's header.
- **Type consistency verified:** `SharedPost`/`SharedPostAuthor` (Task 1) match exactly what `usePosts` selects and what `PostCard` (Task 3) renders. `Channel` (Task 4) is used identically by `useChannels`/`useChannelSubscriptions`/`useToggleChannelSubscription` and both page components (Tasks 6-7). `PostComposer`'s new `channelId` prop (Task 5) is consumed identically by `ChannelPage` (Task 7).
- **Hidden-consumers check applied:** Task 1 names the exact fixture-update need (`shared_post: null` in any `Post`-shaped test object) rather than leaving it for discovery; Task 6 explicitly authorizes and pre-writes the `AppShell.test.tsx` fix for the sixth nav tab, following the same pattern that worked cleanly for `routes.test.tsx` in Plan 1's Task 11 and for `PostCard`/`FeedPage` fixtures in Plan 2's Task 1.
- **No placeholders remain.** The empty-channels-directory-until-seeded caveat is a genuine, disclosed scope boundary (a content/data decision deferred to the user), not an unfinished implementation.
