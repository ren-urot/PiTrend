# Community Feed & Channels — Plan 4 of 4: Offline Drafting

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make post creation always go through an offline-capable draft queue — composing a post (online or offline) writes a local Dexie draft first, then syncs to Supabase automatically when connectivity allows, including queued media uploads. This is the last plan for the Community Feed & Channels sub-project.

**Architecture:** Per the user's explicit choice, this is the "always draft-first" design from the approved design spec, not an online-fast-path-with-offline-fallback — every post, online or offline, goes through the same `queueDraftPost` → `processQueue` path. This is a deliberate rewrite of `PostComposer`'s submission flow (Plans 1-2 had it call `useCreatePost` directly) and adds a merged draft+post view to `FeedPage`/`ChannelPage`. `useCreatePost` itself is left in place, untouched — it's superseded as the composer's entry point but nothing deletes it, since deleting working, tested code that nothing currently references is a separate cleanup decision, not required by this plan's goal.

**Tech Stack:** Same as the rest of this sub-project — Dexie.js (already a dependency since the Foundation phase), no new npm packages.

## Global Constraints

- `post_media`'s 1:1 relationship with `posts` (established in Plan 1's schema) means a draft holds at most one `mediaBlob`, not an array — the original design spec's `mediaBlobs: [...]` notation was written before the schema was finalized; this plan uses the schema-accurate singular form.
- Drafts are per-device (Dexie is local to the browser) — matches Foundation's existing offline model (the persisted TanStack Query cache is also per-device).
- `processQueue()` is fire-and-forget from the composer's perspective — the UI doesn't block on network completion; the draft appears immediately in the feed as "Waiting to send…"/"Sending…" and disappears (replaced by the real post) once synced, or shows "Couldn't send" with a Retry button on failure.
- Every task with runtime logic ships with a Vitest test.
- **This plan rewrites `PostComposer.tsx` and its test file** (Plan 1's Task 10, extended in Plan 2's Task 5, extended again in Plan 3's Task 5 for the `channelId` prop) — this is a deliberate, disclosed consequence of the user's "always draft-first" choice, not scope creep. The `channelId` prop from Plan 3 is preserved.
- **This plan modifies `AppShell.tsx`/`AppShell.test.tsx`** to wire in background sync — `AppShell.test.tsx` currently renders without a `QueryClientProvider` (it's never needed one before), so adding `useOfflineSync()` (which calls `useQueryClient()`) requires wrapping the test and mocking the offline hooks. This is named explicitly here so it's not discovered mid-task, continuing this sub-project's established practice.
- **Report filenames:** use `task-N-report-plan4.md` for every task in this plan, per the convention established in Plans 2-3.

---

### Task 1: `draftPosts` Dexie table

**Files:**
- Modify: `src/lib/db.ts`
- Test: `src/lib/db.test.ts` (new)

**Interfaces:**
- Produces: `DraftPost` type (`{ id, authorId, cityId, channelId, postType, body, mediaBlob?, pollOptions?, buySell?, status, lastError, createdAt }`) and `db.draftPosts` (a Dexie table indexed on `id, authorId, status`), added as a new Dexie schema version alongside the existing `queryCache` table from Foundation. Relied on by every later task in this plan.

- [ ] **Step 1: Write the failing test**

Create `src/lib/db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';

describe('PiMeshDB draftPosts', () => {
  beforeEach(async () => {
    await db.draftPosts.clear();
  });

  it('stores and retrieves a draft post', async () => {
    await db.draftPosts.add({
      id: 'draft-1',
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'text',
      body: 'Hello offline',
      status: 'queued',
      lastError: null,
      createdAt: '2026-01-01T00:00:00Z',
    });

    const draft = await db.draftPosts.get('draft-1');
    expect(draft?.body).toBe('Hello offline');
    expect(draft?.status).toBe('queued');
  });

  it('queries drafts by authorId', async () => {
    await db.draftPosts.bulkAdd([
      {
        id: 'd1',
        authorId: 'user-1',
        cityId: 'city-1',
        channelId: null,
        postType: 'text',
        body: 'a',
        status: 'queued',
        lastError: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'd2',
        authorId: 'user-1',
        cityId: 'city-1',
        channelId: null,
        postType: 'text',
        body: 'b',
        status: 'failed',
        lastError: 'oops',
        createdAt: '2026-01-01T00:00:01Z',
      },
      {
        id: 'd3',
        authorId: 'user-2',
        cityId: 'city-1',
        channelId: null,
        postType: 'text',
        body: 'c',
        status: 'queued',
        lastError: null,
        createdAt: '2026-01-01T00:00:02Z',
      },
    ]);

    const ownDrafts = await db.draftPosts.where('authorId').equals('user-1').toArray();
    expect(ownDrafts).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/db.test.ts`
Expected: FAIL — `db.draftPosts` doesn't exist yet (TypeScript error / runtime `undefined`).

- [ ] **Step 3: Extend the Dexie database**

Replace `src/lib/db.ts`:

```ts
import Dexie, { type Table } from 'dexie';
import type { PostType } from '../types/post';

export interface CachedQueryClient {
  key: string;
  value: string;
}

export interface DraftPost {
  id: string;
  authorId: string;
  cityId: string;
  channelId: string | null;
  postType: PostType;
  body: string | null;
  mediaBlob?: { blob: Blob; mediaType: 'photo' | 'video' };
  pollOptions?: string[];
  buySell?: { priceAmount: number; priceCurrency: 'USD' | 'PHP' | 'PI'; category: string };
  status: 'queued' | 'syncing' | 'failed';
  lastError: string | null;
  createdAt: string;
}

export class PiMeshDB extends Dexie {
  queryCache!: Table<CachedQueryClient, string>;
  draftPosts!: Table<DraftPost, string>;

  constructor() {
    super('pimesh');
    this.version(1).stores({
      queryCache: 'key',
    });
    this.version(2).stores({
      queryCache: 'key',
      draftPosts: 'id, authorId, status',
    });
  }
}

export const db = new PiMeshDB();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS (Foundation's `persister.test.ts` continues to pass unchanged — the `version(2).stores()` call is additive, Dexie's versioning system handles the upgrade transparently for existing `queryCache` data), build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: add draftPosts Dexie table"
```

---

### Task 2: Offline queue — `queueDraftPost`, `processQueue`, `retryDraft`

**Files:**
- Create: `src/lib/offlineQueue.ts`
- Test: `src/lib/offlineQueue.test.ts`

**Interfaces:**
- Produces: `queueDraftPost(input): Promise<string>` (writes a `queued` draft, returns its local id); `processQueue(): Promise<void>` (attempts every `queued` draft: uploads media if present, inserts `posts` + extension-table rows, deletes the draft on success, marks it `failed` with `lastError` on failure); `retryDraft(draftId): Promise<void>` (resets a `failed` draft to `queued` and re-runs `processQueue`). Consumed by Task 5 (`PostComposer`), Task 4 (`useOfflineSync`), and Task 6 (`DraftPostCard`'s Retry button).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/offlineQueue.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueDraftPost, processQueue } from './offlineQueue';
import { db } from './db';

const mockPostInsertSingle = vi.fn();
const mockPostInsertSelect = vi.fn(() => ({ single: mockPostInsertSingle }));
const mockPostInsert = vi.fn(() => ({ select: mockPostInsertSelect }));
const mockMediaInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpload = vi.fn().mockResolvedValue({ error: null });
const mockGetPublicUrl = vi.fn(() => ({
  data: { publicUrl: 'https://example.com/post-media/user-1/post-1.jpg' },
}));

vi.mock('./supabase', () => ({
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

describe('offlineQueue', () => {
  beforeEach(async () => {
    await db.draftPosts.clear();
    mockPostInsertSingle.mockReset().mockResolvedValue({ data: { id: 'post-1' }, error: null });
    mockUpload.mockClear();
    mockMediaInsert.mockClear();
  });

  it('queues a draft post with status queued', async () => {
    const id = await queueDraftPost({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'text',
      body: 'Hello offline',
    });

    const draft = await db.draftPosts.get(id);
    expect(draft?.status).toBe('queued');
    expect(draft?.body).toBe('Hello offline');
  });

  it('syncs a queued text draft and removes it from the queue on success', async () => {
    const id = await queueDraftPost({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'text',
      body: 'Hello offline',
    });

    await processQueue();

    expect(mockPostInsert).toHaveBeenCalledWith({
      author_id: 'user-1',
      city_id: 'city-1',
      channel_id: null,
      post_type: 'text',
      body: 'Hello offline',
    });
    expect(await db.draftPosts.get(id)).toBeUndefined();
  });

  it('uploads queued media and inserts post_media on sync', async () => {
    const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
    await queueDraftPost({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'photo',
      body: null,
      mediaBlob: { blob, mediaType: 'photo' },
    });

    await processQueue();

    expect(mockUpload).toHaveBeenCalledWith('user-1/post-1.jpeg', blob);
    expect(mockMediaInsert).toHaveBeenCalledWith({
      post_id: 'post-1',
      media_url: 'https://example.com/post-media/user-1/post-1.jpg',
      media_type: 'photo',
    });
  });

  it('marks a draft as failed with an error message when sync fails, leaving it in the table', async () => {
    mockPostInsertSingle.mockResolvedValueOnce({ data: null, error: { message: 'network error' } });

    const id = await queueDraftPost({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'text',
      body: 'Will fail',
    });

    await processQueue();

    const draft = await db.draftPosts.get(id);
    expect(draft?.status).toBe('failed');
    expect(draft?.lastError).toBe('network error');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/lib/offlineQueue.test.ts`
Expected: FAIL — `src/lib/offlineQueue.ts` doesn't exist yet.

- [ ] **Step 3: Implement the offline queue**

Create `src/lib/offlineQueue.ts`:

```ts
import { supabase } from './supabase';
import { db, type DraftPost } from './db';

type QueueDraftPostInput = Omit<DraftPost, 'id' | 'status' | 'lastError' | 'createdAt'>;

export async function queueDraftPost(input: QueueDraftPostInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.draftPosts.add({
    ...input,
    id,
    status: 'queued',
    lastError: null,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function processQueue(): Promise<void> {
  const queued = await db.draftPosts.where('status').equals('queued').toArray();

  for (const draft of queued) {
    await db.draftPosts.update(draft.id, { status: 'syncing' });

    try {
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          author_id: draft.authorId,
          city_id: draft.cityId,
          channel_id: draft.channelId,
          post_type: draft.postType,
          body: draft.body,
        })
        .select('id')
        .single();
      if (postError) throw postError;

      if (draft.mediaBlob) {
        const extension =
          draft.mediaBlob.blob.type.split('/')[1] ||
          (draft.mediaBlob.mediaType === 'video' ? 'mp4' : 'jpg');
        const path = `${draft.authorId}/${post.id}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('post-media')
          .upload(path, draft.mediaBlob.blob);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('post-media').getPublicUrl(path);

        const { error: mediaError } = await supabase.from('post_media').insert({
          post_id: post.id,
          media_url: publicUrlData.publicUrl,
          media_type: draft.mediaBlob.mediaType,
        });
        if (mediaError) throw mediaError;
      }

      if (draft.postType === 'poll' && draft.pollOptions) {
        const { error: pollError } = await supabase.from('post_polls').insert({ post_id: post.id });
        if (pollError) throw pollError;

        const { error: optionsError } = await supabase.from('poll_options').insert(
          draft.pollOptions.map((optionText, index) => ({
            post_id: post.id,
            option_text: optionText,
            display_order: index,
          }))
        );
        if (optionsError) throw optionsError;
      }

      if (draft.postType === 'buy_sell' && draft.buySell) {
        const { error: buySellError } = await supabase.from('post_buy_sell').insert({
          post_id: post.id,
          price_amount: draft.buySell.priceAmount,
          price_currency: draft.buySell.priceCurrency,
          category: draft.buySell.category,
        });
        if (buySellError) throw buySellError;
      }

      await db.draftPosts.delete(draft.id);
    } catch (error) {
      await db.draftPosts.update(draft.id, {
        status: 'failed',
        lastError: error instanceof Error ? error.message : 'Something went wrong.',
      });
    }
  }
}

export async function retryDraft(draftId: string): Promise<void> {
  await db.draftPosts.update(draftId, { status: 'queued', lastError: null });
  await processQueue();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/offlineQueue.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/offlineQueue.ts src/lib/offlineQueue.test.ts
git commit -m "feat: add offline queue (queueDraftPost, processQueue, retryDraft)"
```

---

### Task 3: `useQueuedDrafts` hook

**Files:**
- Create: `src/hooks/useQueuedDrafts.ts`
- Test: `src/hooks/useQueuedDrafts.test.tsx`

**Interfaces:**
- Produces: `useQueuedDrafts(userId)` — a `useQuery` keyed `['drafts', userId]`, returning the user's `DraftPost[]` sorted oldest-first, polling every 2 seconds (Dexie writes from `processQueue()` don't otherwise notify TanStack Query, and a local IndexedDB read is cheap enough that a short poll is the simplest robust way to keep the UI current without adding a new dependency like `dexie-react-hooks`). Consumed by Task 7 (`FeedPage`/`ChannelPage`).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useQueuedDrafts.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useQueuedDrafts } from './useQueuedDrafts';
import { db } from '../lib/db';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useQueuedDrafts', () => {
  beforeEach(async () => {
    await db.draftPosts.clear();
  });

  it("returns only the given user's drafts, oldest first", async () => {
    await db.draftPosts.bulkAdd([
      {
        id: 'd2',
        authorId: 'user-1',
        cityId: 'city-1',
        channelId: null,
        postType: 'text',
        body: 'second',
        status: 'queued',
        lastError: null,
        createdAt: '2026-01-01T00:00:05Z',
      },
      {
        id: 'd1',
        authorId: 'user-1',
        cityId: 'city-1',
        channelId: null,
        postType: 'text',
        body: 'first',
        status: 'queued',
        lastError: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'd3',
        authorId: 'user-2',
        cityId: 'city-1',
        channelId: null,
        postType: 'text',
        body: 'someone else',
        status: 'queued',
        lastError: null,
        createdAt: '2026-01-01T00:00:01Z',
      },
    ]);

    const { result } = renderHook(() => useQueuedDrafts('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].body).toBe('first');
    expect(result.current.data?.[1].body).toBe('second');
  });

  it('returns an empty array when there is no user', async () => {
    const { result } = renderHook(() => useQueuedDrafts(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/hooks/useQueuedDrafts.test.tsx`
Expected: FAIL — `src/hooks/useQueuedDrafts.ts` doesn't exist yet.

- [ ] **Step 3: Implement `useQueuedDrafts`**

Create `src/hooks/useQueuedDrafts.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { db, type DraftPost } from '../lib/db';

export function useQueuedDrafts(userId: string | undefined) {
  return useQuery({
    queryKey: ['drafts', userId],
    queryFn: async (): Promise<DraftPost[]> => {
      if (!userId) return [];
      const drafts = await db.draftPosts.where('authorId').equals(userId).toArray();
      return drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    enabled: !!userId,
    refetchInterval: 2000,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/hooks/useQueuedDrafts.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useQueuedDrafts.ts src/hooks/useQueuedDrafts.test.tsx
git commit -m "feat: add useQueuedDrafts hook"
```

---

### Task 4: `useOfflineSync` hook

**Files:**
- Create: `src/hooks/useOfflineSync.ts`
- Test: `src/hooks/useOfflineSync.test.tsx`

**Interfaces:**
- Produces: `useOfflineSync()` — calls `processQueue()` once whenever `useOnlineStatus()` reports online, which covers both "app just loaded while online" (catches drafts stranded from a previous offline session) and "just reconnected" (the same effect re-runs whenever the dependency changes). No-ops while offline. Invalidates `['posts']` and `['drafts']` after a sync attempt. Consumed by Task 7 (called once, in `AppShell`).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useOfflineSync.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOfflineSync } from './useOfflineSync';
import { useOnlineStatus } from './useOnlineStatus';
import { processQueue } from '../lib/offlineQueue';

vi.mock('./useOnlineStatus');
vi.mock('../lib/offlineQueue', () => ({
  processQueue: vi.fn(),
}));

const mockUseOnlineStatus = vi.mocked(useOnlineStatus);
const mockProcessQueue = vi.mocked(processQueue);

function TestComponent() {
  useOfflineSync();
  return null;
}

function renderInProvider() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TestComponent />
    </QueryClientProvider>
  );
}

describe('useOfflineSync', () => {
  beforeEach(() => {
    mockProcessQueue.mockReset().mockResolvedValue(undefined);
  });

  it('runs processQueue on mount when online', () => {
    mockUseOnlineStatus.mockReturnValue(true);
    renderInProvider();
    expect(mockProcessQueue).toHaveBeenCalledTimes(1);
  });

  it('does not run processQueue on mount when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false);
    renderInProvider();
    expect(mockProcessQueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/hooks/useOfflineSync.test.tsx`
Expected: FAIL — `src/hooks/useOfflineSync.ts` doesn't exist yet.

- [ ] **Step 3: Implement `useOfflineSync`**

Create `src/hooks/useOfflineSync.ts`:

```ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from './useOnlineStatus';
import { processQueue } from '../lib/offlineQueue';

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOnline) return;
    processQueue().then(() => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    });
  }, [isOnline, queryClient]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/hooks/useOfflineSync.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOfflineSync.ts src/hooks/useOfflineSync.test.tsx
git commit -m "feat: add useOfflineSync hook"
```

---

### Task 5: Rewrite `PostComposer` to always draft-first

**Files:**
- Modify: `src/components/feed/PostComposer.tsx`, `src/components/feed/PostComposer.test.tsx`

**Interfaces:**
- Consumes: `queueDraftPost`, `processQueue` (Task 2); `getVideoDuration` (existing, from Plan 2).
- Produces: `PostComposer` no longer calls `useCreatePost` — every submission (any post type, online or offline) goes through `queueDraftPost`, followed by a fire-and-forget `processQueue()` call. The `channelId` prop from Plan 3 is preserved unchanged.

This task fully replaces `PostComposer.test.tsx` — the previous version (across Plans 1-3) asserted calls to a mocked `useCreatePost().mutateAsync`; this version asserts calls to mocked `queueDraftPost`/`processQueue` instead, since the component no longer uses `useCreatePost` at all.

- [ ] **Step 1: Replace the failing test first**

Replace `src/components/feed/PostComposer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostComposer } from './PostComposer';
import { queueDraftPost, processQueue } from '../../lib/offlineQueue';
import { getVideoDuration } from '../../lib/media';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../lib/offlineQueue', () => ({
  queueDraftPost: vi.fn(),
  processQueue: vi.fn(),
}));

vi.mock('../../lib/media', () => ({
  getVideoDuration: vi.fn(),
}));

const mockQueueDraftPost = vi.mocked(queueDraftPost);
const mockProcessQueue = vi.mocked(processQueue);
const mockGetVideoDuration = vi.mocked(getVideoDuration);

function renderComposer(channelId?: string | null) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <PostComposer cityId="city-1" channelId={channelId} />
    </QueryClientProvider>
  );
}

describe('PostComposer', () => {
  beforeEach(() => {
    mockQueueDraftPost.mockReset().mockResolvedValue('draft-1');
    mockProcessQueue.mockReset().mockResolvedValue(undefined);
  });

  it('queues a text post as a draft and triggers an immediate sync attempt', async () => {
    renderComposer();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("What's happening?"), 'Hello Cebu!');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockQueueDraftPost).toHaveBeenCalledWith({
        authorId: 'user-1',
        cityId: 'city-1',
        channelId: null,
        postType: 'text',
        body: 'Hello Cebu!',
        mediaBlob: undefined,
        pollOptions: undefined,
        buySell: undefined,
      })
    );
    await waitFor(() => expect(mockProcessQueue).toHaveBeenCalled());
  });

  it('passes a real channelId through when composing inside a channel', async () => {
    renderComposer('channel-1');

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("What's happening?"), 'Channel post');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockQueueDraftPost).toHaveBeenCalledWith(
        expect.objectContaining({ channelId: 'channel-1' })
      )
    );
  });

  it('shows a file picker only when the photo type is selected', async () => {
    renderComposer();

    expect(screen.queryByLabelText('Photo')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Photo' }));

    expect(screen.getByLabelText('Photo')).toBeInTheDocument();
  });

  it('queues a photo post with the media file as a blob', async () => {
    renderComposer();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Photo' }));

    const file = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Photo'), file);
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockQueueDraftPost).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: 'photo',
          mediaBlob: { blob: file, mediaType: 'photo' },
        })
      )
    );
  });

  it('queues poll options for a poll post', async () => {
    renderComposer();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Poll' }));

    const optionInputs = screen.getAllByPlaceholderText('Option');
    await user.type(optionInputs[0], 'CnT');
    await user.type(optionInputs[1], "Rico's");
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockQueueDraftPost).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: 'poll',
          pollOptions: ['CnT', "Rico's"],
        })
      )
    );
  });

  it('queues price/currency/category for a buy & sell post', async () => {
    renderComposer();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Buy & Sell' }));

    await user.type(screen.getByPlaceholderText('Price'), '3500');
    await user.type(screen.getByPlaceholderText('Category'), 'Vehicles');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockQueueDraftPost).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: 'buy_sell',
          buySell: { priceAmount: 3500, priceCurrency: 'PHP', category: 'Vehicles' },
        })
      )
    );
  });

  it('blocks submission when a video exceeds the 60-second cap', async () => {
    mockGetVideoDuration.mockResolvedValue(90);
    renderComposer();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Video' }));

    const file = new File(['fake-video-bytes'], 'clip.mp4', { type: 'video/mp4' });
    await user.upload(screen.getByLabelText('Video'), file);
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(screen.getByText('Videos must be 60 seconds or shorter.')).toBeInTheDocument()
    );
    expect(mockQueueDraftPost).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/feed/PostComposer.test.tsx`
Expected: FAIL — the current `PostComposer` calls `useCreatePost`, not `queueDraftPost`.

- [ ] **Step 3: Rewrite `PostComposer`**

Replace `src/components/feed/PostComposer.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { queueDraftPost, processQueue } from '../../lib/offlineQueue';
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

export function PostComposer({
  cityId,
  channelId = null,
}: {
  cityId: string;
  channelId?: string | null;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [postType, setPostType] = useState<PostType>('text');
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | undefined>(undefined);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [priceAmount, setPriceAmount] = useState('');
  const [priceCurrency, setPriceCurrency] = useState<'USD' | 'PHP' | 'PI'>('PHP');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

    setSubmitting(true);

    try {
      await queueDraftPost({
        authorId: session.user.id,
        cityId,
        channelId,
        postType,
        body: body.trim() || null,
        mediaBlob:
          (postType === 'photo' || postType === 'video') && mediaFile
            ? { blob: mediaFile, mediaType: postType === 'video' ? 'video' : 'photo' }
            : undefined,
        pollOptions: postType === 'poll' ? pollOptions.filter((option) => option.trim()) : undefined,
        buySell:
          postType === 'buy_sell'
            ? { priceAmount: Number(priceAmount), priceCurrency, category: category.trim() }
            : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['drafts', session.user.id] });
      setBody('');
      setMediaFile(undefined);
      setPollOptions(['', '']);
      setPriceAmount('');
      setCategory('');

      processQueue().then(() => {
        queryClient.invalidateQueries({ queryKey: ['posts'] });
        queryClient.invalidateQueries({ queryKey: ['drafts'] });
      });
    } catch {
      setError("Couldn't save your post. Please try again.");
    } finally {
      setSubmitting(false);
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
            <Select
              value={priceCurrency}
              onValueChange={(value) => setPriceCurrency(value as 'USD' | 'PHP' | 'PI')}
            >
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
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Post'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/feed/PostComposer.test.tsx`
Expected: PASS (all seven tests).

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/feed/PostComposer.tsx src/components/feed/PostComposer.test.tsx
git commit -m "feat: rewrite PostComposer to always draft-first via the offline queue"
```

---

### Task 6: `DraftPostCard` component

**Files:**
- Create: `src/components/feed/DraftPostCard.tsx`, `src/components/feed/DraftPostCard.test.tsx`

**Interfaces:**
- Consumes: `retryDraft` (Task 2); `DraftPost` type (Task 1).
- Produces: `DraftPostCard({ draft })` — renders the draft's body plus a status line ("Waiting to send…" / "Sending…" / "Couldn't send: {error}" with a Retry button). Consumed by Task 7 (`FeedPage`/`ChannelPage`).

- [ ] **Step 1: Write the failing test**

Create `src/components/feed/DraftPostCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftPostCard } from './DraftPostCard';
import { retryDraft } from '../../lib/offlineQueue';
import type { DraftPost } from '../../lib/db';

vi.mock('../../lib/offlineQueue', () => ({
  retryDraft: vi.fn(),
}));

const mockRetryDraft = vi.mocked(retryDraft);

const baseDraft: DraftPost = {
  id: 'draft-1',
  authorId: 'user-1',
  cityId: 'city-1',
  channelId: null,
  postType: 'text',
  body: 'Hello offline',
  status: 'queued',
  lastError: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('DraftPostCard', () => {
  it('shows "Waiting to send…" for a queued draft', () => {
    render(<DraftPostCard draft={baseDraft} />);
    expect(screen.getByText('Hello offline')).toBeInTheDocument();
    expect(screen.getByText('Waiting to send…')).toBeInTheDocument();
  });

  it('shows "Sending…" for a syncing draft', () => {
    render(<DraftPostCard draft={{ ...baseDraft, status: 'syncing' }} />);
    expect(screen.getByText('Sending…')).toBeInTheDocument();
  });

  it('shows the error and a Retry button for a failed draft, which calls retryDraft when clicked', async () => {
    render(<DraftPostCard draft={{ ...baseDraft, status: 'failed', lastError: 'network error' }} />);

    expect(screen.getByText("Couldn't send: network error")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mockRetryDraft).toHaveBeenCalledWith('draft-1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/feed/DraftPostCard.test.tsx`
Expected: FAIL — `src/components/feed/DraftPostCard.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `DraftPostCard`**

Create `src/components/feed/DraftPostCard.tsx`:

```tsx
import { retryDraft } from '../../lib/offlineQueue';
import { Button } from '@/components/ui/button';
import type { DraftPost } from '../../lib/db';

export function DraftPostCard({ draft }: { draft: DraftPost }) {
  return (
    <div className="rounded-lg border border-dashed p-4">
      {draft.body && <p className="mb-2 whitespace-pre-wrap">{draft.body}</p>}
      {draft.status === 'queued' && <p className="text-sm text-muted-foreground">Waiting to send…</p>}
      {draft.status === 'syncing' && <p className="text-sm text-muted-foreground">Sending…</p>}
      {draft.status === 'failed' && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-destructive">Couldn't send: {draft.lastError}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => retryDraft(draft.id)}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/feed/DraftPostCard.test.tsx`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/feed/DraftPostCard.tsx src/components/feed/DraftPostCard.test.tsx
git commit -m "feat: add DraftPostCard component"
```

---

### Task 7: Wire drafts into the feed and background sync into `AppShell`

**Files:**
- Modify: `src/routes/FeedPage.tsx`, `src/routes/FeedPage.test.tsx`, `src/routes/ChannelPage.tsx`, `src/routes/ChannelPage.test.tsx`, `src/components/nav/AppShell.tsx`, `src/components/nav/AppShell.test.tsx`

**Interfaces:**
- Consumes: `useQueuedDrafts` (Task 3), `DraftPostCard` (Task 6), `useOfflineSync` (Task 4).
- Produces: `FeedPage`/`ChannelPage` show the viewer's own queued/syncing/failed drafts (scoped to that page's city/channel, so a channel draft doesn't leak into the city feed or vice versa) above the real posts. `AppShell` runs `useOfflineSync()` once, active for every authenticated route regardless of which tab is open.

`AppShell.test.tsx` currently renders without a `QueryClientProvider` — this task adds one, plus mocks for the offline hooks, since `useOfflineSync` (added to `AppShell`) calls `useQueryClient()`. Named explicitly here, not left for mid-task discovery.

- [ ] **Step 1: Extend the failing `FeedPage` test first**

Modify `src/routes/FeedPage.test.tsx` — add a `useQueuedDrafts` mock alongside the existing mocks:

```tsx
import { useQueuedDrafts } from '../hooks/useQueuedDrafts';
```

```tsx
vi.mock('../hooks/useQueuedDrafts');
const mockUseQueuedDrafts = vi.mocked(useQueuedDrafts);
```

Add a default return value inside the existing `beforeEach`:

```tsx
  mockUseQueuedDrafts.mockReturnValue({ data: [], isLoading: false } as any);
```

And add this test case inside the `describe` block:

```tsx
  it('shows a queued draft scoped to the current city above the real posts', async () => {
    mockUseQueuedDrafts.mockReturnValue({
      data: [
        {
          id: 'draft-1',
          authorId: 'user-1',
          cityId: 'city-1',
          channelId: null,
          postType: 'text',
          body: 'Still sending',
          status: 'queued',
          lastError: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      isLoading: false,
    } as any);

    renderPage();
    await waitFor(() => expect(screen.getByText('Still sending')).toBeInTheDocument());
    expect(screen.getByText('Waiting to send…')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/routes/FeedPage.test.tsx`
Expected: FAIL — `FeedPage` doesn't render drafts yet.

- [ ] **Step 3: Extend `FeedPage`**

Replace `src/routes/FeedPage.tsx`:

```tsx
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { usePosts } from '../hooks/usePosts';
import { useQueuedDrafts } from '../hooks/useQueuedDrafts';
import { PostComposer } from '../components/feed/PostComposer';
import { PostCard } from '../components/feed/PostCard';
import { DraftPostCard } from '../components/feed/DraftPostCard';
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
  const { data: drafts } = useQueuedDrafts(session?.user.id);

  const cityName = cities?.find((city) => city.id === profile?.city_id)?.name;

  if (!profile?.city_id) {
    return <ComingSoon title={cityName ? `${cityName} Feed` : 'Feed'} />;
  }

  const ownDrafts = (drafts ?? []).filter(
    (draft) => draft.cityId === profile.city_id && draft.channelId === null
  );

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-xl font-semibold">{cityName} Feed</h1>
      <PostComposer cityId={profile.city_id} />
      {isLoading && <p className="text-muted-foreground">Loading posts…</p>}
      {!isLoading && posts?.length === 0 && ownDrafts.length === 0 && (
        <p className="text-muted-foreground">No posts yet — be the first to post!</p>
      )}
      <div className="flex flex-col gap-4">
        {ownDrafts.map((draft) => (
          <DraftPostCard key={draft.id} draft={draft} />
        ))}
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
Expected: PASS.

- [ ] **Step 5: Extend the failing `ChannelPage` test first**

Modify `src/routes/ChannelPage.test.tsx` — add the same `useQueuedDrafts` mock pattern as `FeedPage.test.tsx`:

```tsx
import { useQueuedDrafts } from '../hooks/useQueuedDrafts';
```

```tsx
vi.mock('../hooks/useQueuedDrafts');
const mockUseQueuedDrafts = vi.mocked(useQueuedDrafts);
```

Add a default inside `renderAt`'s mock setup:

```tsx
  mockUseQueuedDrafts.mockReturnValue({ data: [], isLoading: false } as any);
```

And add this test case:

```tsx
  it('shows a queued draft scoped to this channel above the real posts', async () => {
    mockUseQueuedDrafts.mockReturnValue({
      data: [
        {
          id: 'draft-1',
          authorId: 'user-1',
          cityId: 'city-1',
          channelId: 'ch-1',
          postType: 'text',
          body: 'Channel draft',
          status: 'queued',
          lastError: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      isLoading: false,
    } as any);

    renderAt('/channels/pi-official');
    await waitFor(() => expect(screen.getByText('Channel draft')).toBeInTheDocument());
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- src/routes/ChannelPage.test.tsx`
Expected: FAIL — `ChannelPage` doesn't render drafts yet.

- [ ] **Step 7: Extend `ChannelPage`**

Replace `src/routes/ChannelPage.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useChannels } from '../hooks/useChannels';
import { usePosts } from '../hooks/usePosts';
import { useQueuedDrafts } from '../hooks/useQueuedDrafts';
import { PostComposer } from '../components/feed/PostComposer';
import { PostCard } from '../components/feed/PostCard';
import { DraftPostCard } from '../components/feed/DraftPostCard';

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
  const { data: drafts } = useQueuedDrafts(session?.user.id);

  if (!channel) {
    return <div className="p-6 text-muted-foreground">Loading channel…</div>;
  }

  const ownDrafts = (drafts ?? []).filter((draft) => draft.channelId === channel.id);

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-xl font-semibold">{channel.name}</h1>
      {profile?.city_id && <PostComposer cityId={profile.city_id} channelId={channel.id} />}
      {isLoading && <p className="text-muted-foreground">Loading posts…</p>}
      {!isLoading && posts?.length === 0 && ownDrafts.length === 0 && (
        <p className="text-muted-foreground">No posts yet — be the first to post!</p>
      )}
      <div className="flex flex-col gap-4">
        {ownDrafts.map((draft) => (
          <DraftPostCard key={draft.id} draft={draft} />
        ))}
        {posts?.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- src/routes/ChannelPage.test.tsx`
Expected: PASS.

- [ ] **Step 9: Extend the failing `AppShell` test first**

Replace `src/components/nav/AppShell.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './AppShell';

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => false,
}));

vi.mock('../../lib/offlineQueue', () => ({
  processQueue: vi.fn().mockResolvedValue(undefined),
}));

describe('AppShell', () => {
  it('renders all six nav tabs and the active route content', () => {
    const router = createMemoryRouter(
      [
        {
          element: <AppShell />,
          children: [{ path: '/feed', element: <div>Feed content</div> }],
        },
      ],
      { initialEntries: ['/feed'] }
    );

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );

    expect(screen.getAllByText('Feed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Channels').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Messages').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Marketplace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('News').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
    expect(screen.getByText('Feed content')).toBeInTheDocument();
  });
});
```

`useOnlineStatus` is mocked to return `false` specifically so `useOfflineSync`'s effect no-ops during this unrelated nav-rendering test — it doesn't need to exercise sync behavior, just render without crashing for lack of a `QueryClientProvider`.

- [ ] **Step 10: Run it to verify it fails**

Run: `npm test -- src/components/nav/AppShell.test.tsx`
Expected: FAIL — `AppShell` doesn't call `useOfflineSync` yet, so this specific test (now expecting the mocks/provider to be exercised) may actually still pass at this exact point since nothing requires them yet; the meaningful RED here is that without Step 11's change, adding `useQueryClient()` usage inside `AppShell` is what would break the *original* (unwrapped) test — this step's real purpose is having the corrected test in place *before* the component change, per TDD ordering, even though the observable RED/GREEN delta is subtle. Proceed to Step 11 regardless.

- [ ] **Step 11: Wire `useOfflineSync` into `AppShell`**

Modify `src/components/nav/AppShell.tsx` — add the import and call the hook at the top of the component body:

```ts
import { useOfflineSync } from '../../hooks/useOfflineSync';
```

```tsx
export function AppShell() {
  useOfflineSync();
  return (
```

(Only these two additions — the import and the hook call as the first line of the function body — everything else in `AppShell.tsx` is unchanged.)

- [ ] **Step 12: Run the test to verify it passes**

Run: `npm test -- src/components/nav/AppShell.test.tsx`
Expected: PASS.

- [ ] **Step 13: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 14: Commit**

```bash
git add src/routes/FeedPage.tsx src/routes/FeedPage.test.tsx src/routes/ChannelPage.tsx src/routes/ChannelPage.test.tsx src/components/nav/AppShell.tsx src/components/nav/AppShell.test.tsx
git commit -m "feat: show queued drafts in the feed and run background sync from AppShell"
```

---

## Self-Review Notes

- **Spec coverage:** offline drafting for every post type (text/photo/video/poll/question/buy_sell/merchant_promo/announcement — `repost` is excluded since Share is a one-click action on an already-synced post, not a composer submission), queued media upload, retry-on-failure, background sync on load and on reconnect — all wired end-to-end. This closes out the full 4-plan Community Feed & Channels design; nothing from the design doc's in-scope goals remains unbuilt except the deliberately-deferred channel seeding (a content decision, not code).
- **Type consistency verified:** `DraftPost` (Task 1) is used identically by `offlineQueue.ts` (Task 2), `useQueuedDrafts` (Task 3), `DraftPostCard` (Task 6), and `FeedPage`/`ChannelPage` (Task 7). `queueDraftPost`'s input shape matches exactly what `PostComposer` (Task 5) constructs.
- **Hidden-consumers check applied:** this plan names, upfront, every already-reviewed file it will touch (`PostComposer.tsx`/`.test.tsx`, `FeedPage.tsx`/`.test.tsx`, `ChannelPage.tsx`/`.test.tsx`, `AppShell.tsx`/`.test.tsx`) and why, rather than discovering the need mid-task — continuing the practice that worked cleanly in Plan 3's Tasks 1, 6, and 7.
- **No placeholders remain.**
