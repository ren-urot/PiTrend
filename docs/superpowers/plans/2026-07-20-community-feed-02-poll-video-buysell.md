# Community Feed & Channels — Plan 2 of 4: Poll, Video, Buy & Sell Post Types

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add poll voting, video posts, and buy & sell posts to the city feed built in Plan 1. Repost/share, channels, and offline drafting remain Plans 3-4.

**Architecture:** Extends four existing Plan-1 pieces rather than adding parallel ones: `usePosts` grows its embed to include `poll_options`/`poll_votes(count)`/`post_buy_sell`, plus a third viewer-scoped follow-up query (the poll option the viewer voted for, alongside Plan 1's likes/bookmarks lookups); `useCreatePost` grows its post-type branches to insert into `post_polls`/`poll_options`/`post_buy_sell`, and its media branch to accept `video` alongside `photo`; `PostComposer` and `PostCard` grow their per-type conditional rendering. No new schema — the full schema was already migrated in Plan 1's Task 1.

**Tech Stack:** Same as Plans 1 and the Foundation phase — no new npm dependencies.

## Global Constraints

- Poll voting is single-choice, one vote per user (already enforced by `poll_votes`'s `unique(post_id, voter_id)` from Plan 1's schema) — results become visible to the viewer only after they vote, per the approved design. This plan does NOT add vote-changing (delete-then-revote) even though the RLS policies support it (added defensively during Plan 1's final review) — building that isn't requested yet; YAGNI.
- Video posts reuse `post_media` (the same 1:1 extension table photo posts use) with `media_type: 'video'`, capped client-side at 60 seconds — no server-side validation, no transcoding, per the design's Non-Goals.
- Buy & sell posts require `price_amount`, `price_currency` (`'USD' | 'PHP' | 'PI'`), and `category` — all required, matching the `post_buy_sell` schema's `not null` columns.
- Every task with runtime logic ships with a Vitest test.
- **Risk flagged, not resolved by this plan:** the two-level-deep PostgREST embed this plan relies on (`posts` → `poll_options` → `poll_votes(count)`) is standard, well-documented PostgREST behavior, but has not been exercised against this project's live database by any earlier plan (Plan 1 only embedded one level deep). Task 1's implementer should sanity-check this shape (e.g. via the Supabase dashboard's API docs / a manual REST call with a hand-inserted test poll) before treating the mocked unit tests as sufficient proof it works end-to-end. Magic-link auth (no email access in the execution environment) means a full browser click-through of poll voting isn't practically achievable in this session, same limitation every earlier phase has had for anything requiring a real login.

---

### Task 1: Extend `Post` types and `usePosts` for poll and buy & sell data

**Files:**
- Modify: `src/types/post.ts`, `src/hooks/usePosts.ts`, `src/hooks/usePosts.test.tsx`

**Interfaces:**
- Produces: `PollOption` (`{ id, option_text, display_order, vote_count }`), `Poll` (`{ options: PollOption[], viewer_vote_option_id: string | null }`), `BuySellDetails` (`{ price_amount, price_currency, category }`) types; `Post` gains `poll: Poll | null` and `buy_sell: BuySellDetails | null`. Relied on by every later task in this plan.

- [ ] **Step 1: Extend the types**

Modify `src/types/post.ts` — add these three interfaces after `PostMedia`:

```ts
export interface PollOption {
  id: string;
  option_text: string;
  display_order: number;
  vote_count: number;
}

export interface Poll {
  options: PollOption[];
  viewer_vote_option_id: string | null;
}

export interface BuySellDetails {
  price_amount: number;
  price_currency: 'USD' | 'PHP' | 'PI';
  category: string;
}
```

And add two fields to the `Post` interface, immediately after `post_media: PostMedia | null;`:

```ts
  poll: Poll | null;
  buy_sell: BuySellDetails | null;
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
    post_type: 'poll',
    body: 'Best lechon in town?',
    shared_post_id: null,
    created_at: '2026-01-01T00:00:00Z',
    author: { username: 'renz', display_name: 'Ren', avatar_url: null },
    post_media: null,
    poll_options: [
      { id: 'opt-1', option_text: 'CnT', display_order: 0, poll_votes: [{ count: 3 }] },
      { id: 'opt-2', option_text: 'Rico\'s', display_order: 1, poll_votes: [{ count: 1 }] },
    ],
    post_buy_sell: null,
    likes: [{ count: 0 }],
    comments: [{ count: 0 }],
  },
  {
    id: 'post-2',
    author_id: 'user-2',
    city_id: 'city-1',
    channel_id: null,
    post_type: 'buy_sell',
    body: 'Selling my bike',
    shared_post_id: null,
    created_at: '2026-01-02T00:00:00Z',
    author: { username: 'other', display_name: 'Other', avatar_url: null },
    post_media: null,
    poll_options: [],
    post_buy_sell: { price_amount: 3500, price_currency: 'PHP', category: 'Vehicles' },
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

const mockVotesIn = vi.fn().mockResolvedValue({ data: [{ post_id: 'post-1', poll_option_id: 'opt-1' }] });
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
  it('returns poll tallies, the viewer\'s own vote, and buy & sell details', async () => {
    mockLimit.mockResolvedValue({ data: mockPostsData, error: null });

    const { result } = renderHook(
      () => usePosts({ cityId: 'city-1', channelId: null, viewerId: 'user-1' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [pollPost, buySellPost] = result.current.data!;

    expect(pollPost.poll).toEqual({
      options: [
        { id: 'opt-1', option_text: 'CnT', display_order: 0, vote_count: 3 },
        { id: 'opt-2', option_text: 'Rico\'s', display_order: 1, vote_count: 1 },
      ],
      viewer_vote_option_id: 'opt-1',
    });
    expect(pollPost.buy_sell).toBeNull();

    expect(buySellPost.poll).toBeNull();
    expect(buySellPost.buy_sell).toEqual({
      price_amount: 3500,
      price_currency: 'PHP',
      category: 'Vehicles',
    });

    expect(mockSelect).toHaveBeenCalledWith(
      'id, author_id, city_id, channel_id, post_type, body, shared_post_id, created_at, ' +
        'author:profiles!posts_author_id_fkey(username, display_name, avatar_url), ' +
        'post_media(media_url, media_type, duration_seconds), ' +
        'poll_options(id, option_text, display_order, poll_votes(count)), ' +
        'post_buy_sell(price_amount, price_currency, category), ' +
        'likes(count), comments(count)'
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- src/hooks/usePosts.test.tsx`
Expected: FAIL — the current `usePosts.ts` doesn't select poll/buy-sell columns or compute `poll`/`buy_sell`, and `Post` doesn't have those fields yet (also a type error).

- [ ] **Step 4: Extend `usePosts`**

Replace `src/hooks/usePosts.ts`:

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
            'poll_options(id, option_text, display_order, poll_votes(count)), ' +
            'post_buy_sell(price_amount, price_currency, category), ' +
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
      let viewerVotes = new Map<string, string>();

      if (viewerId && postIds.length > 0) {
        const [{ data: likedRows }, { data: bookmarkedRows }, { data: voteRows }] = await Promise.all([
          supabase.from('likes').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
          supabase.from('bookmarks').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
          supabase.from('poll_votes').select('post_id, poll_option_id').eq('voter_id', viewerId).in('post_id', postIds),
        ]);
        likedIds = new Set((likedRows ?? []).map((row: any) => row.post_id));
        bookmarkedIds = new Set((bookmarkedRows ?? []).map((row: any) => row.post_id));
        viewerVotes = new Map((voteRows ?? []).map((row: any) => [row.post_id, row.poll_option_id]));
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
        poll:
          row.poll_options && row.poll_options.length > 0
            ? {
                options: [...row.poll_options]
                  .sort((a: any, b: any) => a.display_order - b.display_order)
                  .map((option: any) => ({
                    id: option.id,
                    option_text: option.option_text,
                    display_order: option.display_order,
                    vote_count: option.poll_votes?.[0]?.count ?? 0,
                  })),
                viewer_vote_option_id: viewerVotes.get(row.id) ?? null,
              }
            : null,
        buy_sell: row.post_buy_sell ?? null,
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/hooks/usePosts.test.tsx`
Expected: PASS.

- [ ] **Step 6: Sanity-check the two-level embed against the live database (manual, best-effort)**

This project's Supabase dashboard has an API docs page (Project → API Docs) that lets you try a `GET /rest/v1/posts?select=...` call with your actual schema. Paste in the `poll_options(id, option_text, display_order, poll_votes(count))` portion of the select string above and confirm it returns without a PostgREST error (an empty result set is fine — there's no poll data yet since `useCreatePost` doesn't support creating polls until Task 3 of this plan; a schema/relationship error is what to watch for). If it errors, stop and report — the embed shape needs to be reconsidered before later tasks build on it.

- [ ] **Step 7: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS (including Plan 1's `PostCard.test.tsx`/`FeedPage.test.tsx`, which construct `Post` objects — TypeScript will require them to include the two new fields; if any fail to compile, add `poll: null, buy_sell: null` to their test fixtures), build exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/types/post.ts src/hooks/usePosts.ts src/hooks/usePosts.test.tsx
git commit -m "feat: extend Post type and usePosts for poll and buy & sell data"
```

---

### Task 2: `useVoteOnPoll` hook

**Files:**
- Create: `src/hooks/useVoteOnPoll.ts`
- Test: `src/hooks/useVoteOnPoll.test.tsx`

**Interfaces:**
- Produces: `useVoteOnPoll()` — a `useMutation` accepting `{ postId, pollOptionId, voterId, cityId, channelId }`, inserting into `poll_votes`, invalidating `['posts', cityId, channelId]` on success. Consumed by Task 6 (`PostCard`'s poll rendering).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useVoteOnPoll.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useVoteOnPoll } from './useVoteOnPoll';

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

describe('useVoteOnPoll', () => {
  it('inserts a poll vote and invalidates the posts query', async () => {
    const { result } = renderHook(() => useVoteOnPoll(), { wrapper });

    result.current.mutate({
      postId: 'post-1',
      pollOptionId: 'opt-1',
      voterId: 'user-1',
      cityId: 'city-1',
      channelId: null,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({
      post_id: 'post-1',
      poll_option_id: 'opt-1',
      voter_id: 'user-1',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/hooks/useVoteOnPoll.test.tsx`
Expected: FAIL — `src/hooks/useVoteOnPoll.ts` doesn't exist yet.

- [ ] **Step 3: Implement `useVoteOnPoll`**

Create `src/hooks/useVoteOnPoll.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface VoteOnPollInput {
  postId: string;
  pollOptionId: string;
  voterId: string;
  cityId: string;
  channelId: string | null;
}

export function useVoteOnPoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: VoteOnPollInput) => {
      const { error } = await supabase.from('poll_votes').insert({
        post_id: input.postId,
        poll_option_id: input.pollOptionId,
        voter_id: input.voterId,
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

Run: `npm test -- src/hooks/useVoteOnPoll.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useVoteOnPoll.ts src/hooks/useVoteOnPoll.test.tsx
git commit -m "feat: add useVoteOnPoll mutation hook"
```

---

### Task 3: Extend `useCreatePost` for poll, buy & sell, and video

**Files:**
- Modify: `src/hooks/useCreatePost.ts`, `src/hooks/useCreatePost.test.tsx`

**Interfaces:**
- Produces: `CreatePostInput` gains `mediaType?: 'photo' | 'video'` (defaulting to `'photo'` when a `mediaFile` is present but `mediaType` isn't specified, preserving Plan 1 callers' behavior unchanged), `pollOptions?: string[]`, `buySell?: { priceAmount: number; priceCurrency: 'USD' | 'PHP' | 'PI'; category: string }`. When `postType === 'poll'` and `pollOptions` is provided, inserts `post_polls` + `poll_options`. When `postType === 'buy_sell'` and `buySell` is provided, inserts `post_buy_sell`.

- [ ] **Step 1: Extend the failing tests first**

Modify `src/hooks/useCreatePost.test.tsx` — keep the existing two tests (text post, photo post) exactly as they are, and add these two:

```tsx
  it('inserts post_polls and poll_options for a poll post', async () => {
    const { result } = renderHook(() => useCreatePost(), { wrapper });

    result.current.mutate({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'poll',
      body: 'Best lechon in town?',
      pollOptions: ['CnT', "Rico's"],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPollInsert).toHaveBeenCalledWith({ post_id: 'post-1' });
    expect(mockPollOptionsInsert).toHaveBeenCalledWith([
      { post_id: 'post-1', option_text: 'CnT', display_order: 0 },
      { post_id: 'post-1', option_text: "Rico's", display_order: 1 },
    ]);
  });

  it('inserts post_buy_sell for a buy & sell post', async () => {
    const { result } = renderHook(() => useCreatePost(), { wrapper });

    result.current.mutate({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'buy_sell',
      body: 'Selling my bike',
      buySell: { priceAmount: 3500, priceCurrency: 'PHP', category: 'Vehicles' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockBuySellInsert).toHaveBeenCalledWith({
      post_id: 'post-1',
      price_amount: 3500,
      price_currency: 'PHP',
      category: 'Vehicles',
    });
  });
```

And replace the file's mock setup (everything above the first `describe` block) with:

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
const mockPollInsert = vi.fn().mockResolvedValue({ error: null });
const mockPollOptionsInsert = vi.fn().mockResolvedValue({ error: null });
const mockBuySellInsert = vi.fn().mockResolvedValue({ error: null });

const mockUpload = vi.fn().mockResolvedValue({ error: null });
const mockGetPublicUrl = vi.fn(() => ({ data: { publicUrl: 'https://example.com/post-media/user-1/post-1.jpg' } }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'post_media') return { insert: mockMediaInsert };
      if (table === 'post_polls') return { insert: mockPollInsert };
      if (table === 'poll_options') return { insert: mockPollOptionsInsert };
      if (table === 'post_buy_sell') return { insert: mockBuySellInsert };
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
```

(This is a superset of the Plan 1 mock — the `from` function now branches on more tables. The existing two tests should still pass unchanged since `'posts'` still falls through to the `mockPostInsert` default branch.)

- [ ] **Step 2: Run the tests to verify the two new ones fail**

Run: `npm test -- src/hooks/useCreatePost.test.tsx`
Expected: the two existing tests PASS (mock setup is a superset, doesn't change their behavior); the two new tests FAIL — `useCreatePost` doesn't yet insert into `post_polls`/`poll_options`/`post_buy_sell`.

- [ ] **Step 3: Extend `useCreatePost`**

Replace `src/hooks/useCreatePost.ts`:

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
  mediaType?: 'photo' | 'video';
  pollOptions?: string[];
  buySell?: { priceAmount: number; priceCurrency: 'USD' | 'PHP' | 'PI'; category: string };
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
          media_type: input.mediaType ?? 'photo',
        });
        if (mediaError) throw mediaError;
      }

      if (input.postType === 'poll' && input.pollOptions) {
        const { error: pollError } = await supabase.from('post_polls').insert({ post_id: post.id });
        if (pollError) throw pollError;

        const { error: optionsError } = await supabase.from('poll_options').insert(
          input.pollOptions.map((optionText, index) => ({
            post_id: post.id,
            option_text: optionText,
            display_order: index,
          }))
        );
        if (optionsError) throw optionsError;
      }

      if (input.postType === 'buy_sell' && input.buySell) {
        const { error: buySellError } = await supabase.from('post_buy_sell').insert({
          post_id: post.id,
          price_amount: input.buySell.priceAmount,
          price_currency: input.buySell.priceCurrency,
          category: input.buySell.category,
        });
        if (buySellError) throw buySellError;
      }

      return post;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.cityId, variables.channelId] });
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `npm test -- src/hooks/useCreatePost.test.tsx`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCreatePost.ts src/hooks/useCreatePost.test.tsx
git commit -m "feat: extend useCreatePost for poll, buy & sell, and video posts"
```

---

### Task 4: Video duration validation utility

**Files:**
- Create: `src/lib/media.ts`
- Test: `src/lib/media.test.ts`

**Interfaces:**
- Produces: `getVideoDuration(file: File): Promise<number>` — resolves with the video's duration in seconds by loading its metadata client-side, without uploading it anywhere. Consumed by Task 5 (`PostComposer`), which enforces the 60-second cap before allowing a video post to submit.

- [ ] **Step 1: Write the failing test**

Create `src/lib/media.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getVideoDuration } from './media';

describe('getVideoDuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves with the duration once the video metadata loads', async () => {
    const fakeVideo: any = { preload: '', src: '', duration: 12.5 };
    vi.spyOn(document, 'createElement').mockReturnValue(fakeVideo);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const file = new File(['fake-video-bytes'], 'clip.mp4', { type: 'video/mp4' });
    const promise = getVideoDuration(file);

    fakeVideo.onloadedmetadata();

    await expect(promise).resolves.toBe(12.5);
  });

  it('rejects if the video metadata fails to load', async () => {
    const fakeVideo: any = { preload: '', src: '' };
    vi.spyOn(document, 'createElement').mockReturnValue(fakeVideo);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const file = new File(['not-a-video'], 'broken.mp4', { type: 'video/mp4' });
    const promise = getVideoDuration(file);

    fakeVideo.onerror();

    await expect(promise).rejects.toThrow('Could not read video metadata');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/media.test.ts`
Expected: FAIL — `src/lib/media.ts` doesn't exist yet.

- [ ] **Step 3: Implement `getVideoDuration`**

Create `src/lib/media.ts`:

```ts
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Could not read video metadata'));
    };
    video.src = URL.createObjectURL(file);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/media.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/media.ts src/lib/media.test.ts
git commit -m "feat: add getVideoDuration client-side validation utility"
```

---

### Task 5: Extend `PostComposer` for poll, buy & sell, and video

**Files:**
- Modify: `src/components/feed/PostComposer.tsx`, `src/components/feed/PostComposer.test.tsx`

**Interfaces:**
- Consumes: `getVideoDuration` (Task 4); `useCreatePost`'s extended input shape (Task 3).
- Produces: the composer offers `poll`, `buy_sell`, `video` alongside Plan 1's five types, with type-specific fields.

- [ ] **Step 1: Extend the failing tests first**

Modify `src/components/feed/PostComposer.test.tsx` — keep the two existing tests, and add:

```tsx
import { getVideoDuration } from '../../lib/media';

vi.mock('../../lib/media', () => ({
  getVideoDuration: vi.fn(),
}));

const mockGetVideoDuration = vi.mocked(getVideoDuration);
```

(add this near the top, alongside the existing `mockMutateAsync` setup). This file has no global mock-clearing configured (no `clearMocks`/`restoreMocks` in `vite.config.ts`), so `mockMutateAsync`'s call history accumulates across `it()` blocks in file order — add a `beforeEach(() => { vi.clearAllMocks(); mockMutateAsync.mockResolvedValue({ id: 'post-1' }); })` near the top of the `describe` block, or the video-cap test's `.not.toHaveBeenCalled()` assertion below will see leftover calls from the poll/buy-sell tests and fail for the wrong reason. Then add these test cases inside the `describe` block:

```tsx
  it('submits poll options for a poll post', async () => {
    render(<PostComposer cityId="city-1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Poll' }));

    const optionInputs = screen.getAllByPlaceholderText('Option');
    await user.type(optionInputs[0], 'CnT');
    await user.type(optionInputs[1], "Rico's");
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: 'poll',
          pollOptions: ['CnT', "Rico's"],
        })
      )
    );
  });

  it('submits price/currency/category for a buy & sell post', async () => {
    render(<PostComposer cityId="city-1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Buy & Sell' }));

    await user.type(screen.getByPlaceholderText('Price'), '3500');
    await user.type(screen.getByPlaceholderText('Category'), 'Vehicles');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: 'buy_sell',
          buySell: { priceAmount: 3500, priceCurrency: 'PHP', category: 'Vehicles' },
        })
      )
    );
  });

  it('blocks submission when a video exceeds the 60-second cap', async () => {
    mockGetVideoDuration.mockResolvedValue(90);
    render(<PostComposer cityId="city-1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Video' }));

    const file = new File(['fake-video-bytes'], 'clip.mp4', { type: 'video/mp4' });
    await user.upload(screen.getByLabelText('Video'), file);
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(screen.getByText('Videos must be 60 seconds or shorter.')).toBeInTheDocument()
    );
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify the three new ones fail**

Run: `npm test -- src/components/feed/PostComposer.test.tsx`
Expected: the two existing tests PASS; the three new ones FAIL — no poll/buy-sell/video fields exist in the composer yet.

- [ ] **Step 3: Implement the extended `PostComposer`**

Replace `src/components/feed/PostComposer.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCreatePost } from '../../hooks/useCreatePost';
import { getVideoDuration } from '../../lib/media';
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
  { value: 'video', label: 'Video' },
  { value: 'poll', label: 'Poll' },
  { value: 'question', label: 'Question' },
  { value: 'buy_sell', label: 'Buy & Sell' },
  { value: 'merchant_promo', label: 'Merchant promotion' },
  { value: 'announcement', label: 'Announcement' },
];

const CURRENCIES: { value: 'USD' | 'PHP' | 'PI'; label: string }[] = [
  { value: 'PHP', label: 'PHP' },
  { value: 'USD', label: 'USD' },
  { value: 'PI', label: 'PI' },
];

export function PostComposer({ cityId }: { cityId: string }) {
  const { session } = useAuth();
  const createPost = useCreatePost();
  const [postType, setPostType] = useState<PostType>('text');
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | undefined>(undefined);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [priceAmount, setPriceAmount] = useState('');
  const [priceCurrency, setPriceCurrency] = useState<'USD' | 'PHP' | 'PI'>('PHP');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');

  function updatePollOption(index: number, value: string) {
    setPollOptions((options) => options.map((option, i) => (i === index ? value : option)));
  }

  function addPollOption() {
    setPollOptions((options) => (options.length < 4 ? [...options, ''] : options));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError('');

    if (postType === 'video' && mediaFile) {
      const duration = await getVideoDuration(mediaFile);
      if (duration > 60) {
        setError('Videos must be 60 seconds or shorter.');
        return;
      }
    }

    try {
      await createPost.mutateAsync({
        authorId: session.user.id,
        cityId,
        channelId: null,
        postType,
        body: body.trim() || null,
        mediaFile: postType === 'photo' || postType === 'video' ? mediaFile : undefined,
        mediaType: postType === 'video' ? 'video' : postType === 'photo' ? 'photo' : undefined,
        pollOptions: postType === 'poll' ? pollOptions.filter((option) => option.trim()) : undefined,
        buySell:
          postType === 'buy_sell'
            ? { priceAmount: Number(priceAmount), priceCurrency, category: category.trim() }
            : undefined,
      });
      setBody('');
      setMediaFile(undefined);
      setPollOptions(['', '']);
      setPriceAmount('');
      setCategory('');
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
      {(postType === 'photo' || postType === 'video') && (
        <label className="text-sm">
          {postType === 'photo' ? 'Photo' : 'Video'}
          <input
            type="file"
            accept={postType === 'photo' ? 'image/*' : 'video/*'}
            aria-label={postType === 'photo' ? 'Photo' : 'Video'}
            onChange={(event) => setMediaFile(event.target.files?.[0])}
          />
        </label>
      )}
      {postType === 'poll' && (
        <div className="flex flex-col gap-2">
          {pollOptions.map((option, index) => (
            <Input
              key={index}
              placeholder="Option"
              value={option}
              onChange={(event) => updatePollOption(index, event.target.value)}
            />
          ))}
          {pollOptions.length < 4 && (
            <Button type="button" variant="outline" size="sm" onClick={addPollOption}>
              Add option
            </Button>
          )}
        </div>
      )}
      {postType === 'buy_sell' && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              placeholder="Price"
              type="number"
              value={priceAmount}
              onChange={(event) => setPriceAmount(event.target.value)}
            />
            <Select value={priceCurrency} onValueChange={(value) => setPriceCurrency(value as 'USD' | 'PHP' | 'PI')}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((currency) => (
                  <SelectItem key={currency.value} value={currency.value}>
                    {currency.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            placeholder="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
      )}
      <Button type="submit" disabled={createPost.isPending}>
        {createPost.isPending ? 'Posting…' : 'Post'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `npm test -- src/components/feed/PostComposer.test.tsx`
Expected: PASS (all five tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/feed/PostComposer.tsx src/components/feed/PostComposer.test.tsx
git commit -m "feat: extend PostComposer for poll, buy & sell, and video posts"
```

---

### Task 6: Extend `PostCard` for poll, buy & sell, and video rendering

**Files:**
- Create: `src/components/feed/PollOptionRow.tsx`
- Modify: `src/components/feed/PostCard.tsx`, `src/components/feed/PostCard.test.tsx`

**Interfaces:**
- Consumes: `useVoteOnPoll` (Task 2); `Post`/`Poll`/`PollOption`/`BuySellDetails` types (Task 1).
- Produces: `PostCard` renders poll options (vote buttons before voting, result bars after), buy & sell price/currency/category, and `<video>` playback for video media — alongside Plan 1's existing text/photo rendering.

- [ ] **Step 1: Extend the failing test first**

Modify `src/components/feed/PostCard.test.tsx` — the existing `post` fixture object needs `poll: null, buy_sell: null` added (required by the Task 1 type change) alongside its existing fields, and add these test cases inside the `describe` block:

```tsx
  it('renders buy & sell price, currency, and category', () => {
    renderCard({
      post_type: 'buy_sell',
      buy_sell: { price_amount: 3500, price_currency: 'PHP', category: 'Vehicles' },
    });
    expect(screen.getByText('PHP 3500 · Vehicles')).toBeInTheDocument();
  });

  it('renders poll options as vote buttons before the viewer has voted', () => {
    renderCard({
      post_type: 'poll',
      poll: {
        options: [
          { id: 'opt-1', option_text: 'CnT', display_order: 0, vote_count: 3 },
          { id: 'opt-2', option_text: "Rico's", display_order: 1, vote_count: 1 },
        ],
        viewer_vote_option_id: null,
      },
    });
    expect(screen.getByRole('button', { name: 'CnT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Rico's" })).toBeInTheDocument();
  });

  it('renders poll results after the viewer has voted', () => {
    renderCard({
      post_type: 'poll',
      poll: {
        options: [
          { id: 'opt-1', option_text: 'CnT', display_order: 0, vote_count: 3 },
          { id: 'opt-2', option_text: "Rico's", display_order: 1, vote_count: 1 },
        ],
        viewer_vote_option_id: 'opt-1',
      },
    });
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CnT' })).not.toBeInTheDocument();
  });

  it('casts a vote when an unvoted poll option is clicked', async () => {
    renderCard({
      post_type: 'poll',
      poll: {
        options: [{ id: 'opt-1', option_text: 'CnT', display_order: 0, vote_count: 0 }],
        viewer_vote_option_id: null,
      },
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'CnT' }));

    expect(mockVoteOnPollMutate).toHaveBeenCalledWith({
      postId: 'post-1',
      pollOptionId: 'opt-1',
      voterId: 'user-1',
      cityId: 'city-1',
      channelId: null,
    });
  });
```

Also add, alongside the file's existing `mockToggleLikeMutate`/`mockToggleBookmarkMutate` mocks:

```tsx
const mockVoteOnPollMutate = vi.fn();

vi.mock('../../hooks/useVoteOnPoll', () => ({
  useVoteOnPoll: () => ({ mutate: mockVoteOnPollMutate }),
}));
```

And update the base `post` fixture to include `poll: null, buy_sell: null`, and update `renderCard`'s signature to accept `Partial<Post>` overrides (it already does, per Plan 1's Task 8 code) so the new tests' partial overrides work.

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test -- src/components/feed/PostCard.test.tsx`
Expected: the two existing tests PASS (once the fixture has `poll`/`buy_sell` added to satisfy the type); the four new tests FAIL — no poll/buy-sell rendering exists yet.

- [ ] **Step 3: Create `PollOptionRow`**

Create `src/components/feed/PollOptionRow.tsx`:

```tsx
import { useAuth } from '../../hooks/useAuth';
import { useVoteOnPoll } from '../../hooks/useVoteOnPoll';
import type { Post, PollOption } from '../../types/post';

export function PollOptionRow({ option, post }: { option: PollOption; post: Post }) {
  const { session } = useAuth();
  const voteOnPoll = useVoteOnPoll();
  const viewerId = session?.user.id;

  const hasVoted = post.poll?.viewer_vote_option_id != null;
  const totalVotes = post.poll?.options.reduce((sum, o) => sum + o.vote_count, 0) ?? 0;
  const percentage = totalVotes > 0 ? Math.round((option.vote_count / totalVotes) * 100) : 0;

  if (hasVoted) {
    const isViewerChoice = option.id === post.poll?.viewer_vote_option_id;
    return (
      <div className="rounded border px-2 py-1 text-sm">
        <div className="flex justify-between">
          <span>
            {option.option_text}
            {isViewerChoice ? ' ✓' : ''}
          </span>
          <span>{percentage}%</span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!viewerId}
      className="rounded border px-2 py-1 text-left text-sm"
      onClick={() =>
        viewerId &&
        voteOnPoll.mutate({
          postId: post.id,
          pollOptionId: option.id,
          voterId: viewerId,
          cityId: post.city_id,
          channelId: post.channel_id,
        })
      }
    >
      {option.option_text}
    </button>
  );
}
```

- [ ] **Step 4: Extend `PostCard`**

Modify `src/components/feed/PostCard.tsx` — add the `PollOptionRow` import and, after the existing `post.post_media && post.post_media.media_type === 'photo'` block, add:

```tsx
      {post.post_media && post.post_media.media_type === 'video' && (
        <video
          src={post.post_media.media_url}
          controls
          className="mb-2 max-h-96 w-full rounded-md"
        />
      )}

      {post.buy_sell && (
        <p className="mb-2 text-sm font-medium">
          {post.buy_sell.price_currency} {post.buy_sell.price_amount} · {post.buy_sell.category}
        </p>
      )}

      {post.poll && (
        <div className="mb-2 flex flex-col gap-1">
          {post.poll.options.map((option) => (
            <PollOptionRow key={option.id} option={option} post={post} />
          ))}
        </div>
      )}
```

(Insert this block immediately after the photo `<img>` block and before the like/comment/bookmark action row.)

- [ ] **Step 5: Run the tests to verify they all pass**

Run: `npm test -- src/components/feed/PostCard.test.tsx`
Expected: PASS (all six tests).

- [ ] **Step 6: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/feed/PollOptionRow.tsx src/components/feed/PostCard.tsx src/components/feed/PostCard.test.tsx
git commit -m "feat: render poll voting, buy & sell details, and video playback in PostCard"
```

---

## Self-Review Notes

- **Spec coverage (this plan's scope only):** poll voting (single-choice, results-after-voting, per the approved design), video posts (client-capped at 60s, reusing `post_media`), buy & sell posts (required price/currency/category) — all wired end-to-end from schema (already migrated in Plan 1) through `usePosts`/`useCreatePost`/`PostComposer`/`PostCard`. Repost/share, channels, and offline drafting remain out of scope, per the design doc and Plan 1's header.
- **Type consistency verified:** `PollOption`/`Poll`/`BuySellDetails` (Task 1) are used identically by `usePosts` (Task 1), `useVoteOnPoll` (Task 2), `PostCard`/`PollOptionRow` (Task 6). `CreatePostInput`'s new fields (Task 3) are populated identically by `PostComposer` (Task 5).
- **Hidden-consumers check applied:** Task 1 explicitly calls out that Plan 1's `PostCard.test.tsx`/`FeedPage.test.tsx` fixtures construct `Post` objects that will fail to type-check once `poll`/`buy_sell` become required fields, and names the fix (`poll: null, buy_sell: null` in each fixture) rather than leaving it for mid-implementation discovery.
- **No placeholders remain.**
