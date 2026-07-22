# Messaging — Plan 2 of 2: Offline-First Message Queueing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sending a message draft-first — typed while online or offline, it queues locally first and syncs to Supabase in the background — mirroring the exact pattern already built and proven for Feed posts in Community Feed & Channels Plan 4.

**Architecture:** A new Dexie table (`draftMessages`, schema version 3) holds queued messages; a new `messageQueue.ts` module (`queueDraftMessage`, `processMessageQueue`, `retryDraftMessage`) mirrors `offlineQueue.ts`'s shape exactly, with the two lessons from that plan's final review (session-scoping, stale-`syncing` orphan recovery) built in from the start rather than discovered later. `useOfflineSync` (already mounted once in `AppShell`) is extended to drive both queues from the same mount/reconnect triggers. `ConversationPage`'s composer switches from calling `useSendMessage` directly to queuing a draft; queued/failed drafts render inline as right-aligned bubbles among the real messages, exactly like `DraftPostCard` does in `FeedPage`/`ChannelPage`.

**Tech Stack:** Same as prior sub-projects — see `docs/superpowers/plans/2026-07-19-foundation.md`'s Tech Stack section for exact versions. No new npm dependencies this plan.

## Global Constraints

- **This is a separate Dexie table and a separate queue module from posts — not a shared generic "draft" abstraction.** Messages and posts sync to different tables with different shapes (`conversation_id`/`sender_id` vs. `city_id`/`channel_id`/`post_type`); forcing a shared abstraction now would be speculative generality for a resemblance that's only skin-deep at the field-name level. This was the explicit, approved design decision in `docs/superpowers/specs/2026-07-20-messaging-design.md`'s "Offline-first sending" section.
- **Session-scoping and orphan recovery are first-class requirements from Task 2 onward, not something to add after a review finds them missing.** `processMessageQueue` must (a) only ever touch drafts where `senderId` matches the *currently authenticated* session's user id (checked fresh via `supabase.auth.getSession()` each call — never trust a stale prop), and (b) query drafts with `status in ('queued', 'syncing')`, not just `'queued'`, so a draft stuck mid-sync by a crashed or closed tab in a previous session gets picked back up. Both of these were Important findings in Community Feed & Channels Plan 4's final review, discovered only after the fact — here they're specified upfront.
- **No video for message drafts** — `draftMessages.mediaBlob`, when present, is always `{ blob: Blob; mediaType: 'photo' }`. This matches the Messaging design's Goals ("Text and photo messages — no video") and the existing `ConversationPage` composer, which already only offers a photo picker (`accept="image/*"`), never video.
- **Constraint-ordering for the sync insert, exact**: `processMessageQueue` must upload the queued photo (if any) to Storage *before* inserting the `messages` row, then insert with the final `media_url` already populated in that one insert — never insert first and update `media_url` afterward. `messages` has a `check (body is not null or media_url is not null)` constraint (migration `0010_create_messaging_schema.sql`); insert-then-update risks a transient violation of that constraint and was explicitly verified and rejected during Messaging Plan 1 (see MSG1-Task 8 in `.superpowers/sdd/progress.md`). The existing non-queued `useSendMessage` hook (`src/hooks/useMessageActions.ts`) already follows this ordering — mirror it exactly.
- **The draft's own `id` (a client-generated UUID, created at queue time) is used as the final `messages.id` on sync** — the same id serves as both the Dexie `draftMessages` primary key and the eventual Supabase row's id, with no remapping step. This matches the existing (non-queued) `useSendMessage` hook's convention of generating `messageId = crypto.randomUUID()` client-side before the insert (so the Storage path can be built before the row exists) — Task 2 continues that same convention rather than introducing a second id scheme.
- **`useSendMessage` (in `src/hooks/useMessageActions.ts`) is not deleted.** After Task 6, `ConversationPage` no longer calls it directly (it queues a draft instead), so it becomes unused — kept as-is rather than deleted, matching the deliberate choice already made for `useCreatePost.ts` in Community Feed & Channels Plan 4 (dead code kept on purpose, not a cleanup target for this plan).
- **`src/components/nav/AppShell.tsx` gains a new import** (`processMessageQueue` from the new `src/lib/messageQueue.ts`, via the extended `useOfflineSync`) **that `src/components/nav/AppShell.test.tsx` does not yet mock.** That test file already mocks `../../lib/offlineQueue` for the existing `processQueue` call; Task 3 must add an equivalent mock for `../../lib/messageQueue`, or every AppShell test will fail once `useOfflineSync` imports it.
- **`src/routes/ConversationPage.test.tsx`'s existing send-flow tests assert `useSendMessage`'s `mutateAsync` is called directly on submit.** Task 6 changes this: submitting the composer calls `queueDraftMessage` instead. Those two existing tests ("sends a text message and clears the input" and "does not send an empty message with no text and no photo") must be rewritten to assert against `queueDraftMessage`, not deleted — the behavior they protect (input clears, empty submits are ignored) still needs coverage.
- Every task with runtime logic ships with a Vitest test; this plan requires no new Supabase migrations, Storage buckets, or manual dashboard steps — it reuses the existing `messages` table and `message-media` Storage bucket from Messaging Plan 1 unchanged.
- `fake-indexeddb/auto` is already globally configured (`src/test/setup.ts`) for real Dexie behavior in tests — no setup changes needed for that.
- **jsdom's `Blob` polyfill silently degrades to `{}` when round-tripped through Dexie in tests**, because `fake-indexeddb` clones stored values with Node's native `structuredClone`, which doesn't recognize jsdom's `Blob`. `src/lib/offlineQueue.test.ts` works around this by swapping in Node's own `Blob` (via a dynamic `import('node:buffer')`) in a `beforeAll` hook, for that test file only. Task 2's test file needs the identical workaround — copy it verbatim, don't rediscover it.

---

### Task 1: `draftMessages` Dexie table

**Files:**
- Modify: `src/lib/db.ts`
- Test: `src/lib/db.test.ts`

**Interfaces:**
- Produces: `DraftMessage` interface, `PiMeshDB.draftMessages: Table<DraftMessage, string>` (schema version 3). Relied on by every later task in this plan.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/db.test.ts` (below the existing `describe('PiMeshDB draftPosts', ...)` block — do not modify the existing block):

```ts
describe('PiMeshDB draftMessages', () => {
  beforeEach(async () => {
    await db.draftMessages.clear();
  });

  it('stores and retrieves a draft message', async () => {
    await db.draftMessages.add({
      id: 'draft-msg-1',
      conversationId: 'conv-1',
      senderId: 'user-1',
      body: 'Hello offline',
      status: 'queued',
      lastError: null,
      createdAt: '2026-01-01T00:00:00Z',
    });

    const draft = await db.draftMessages.get('draft-msg-1');
    expect(draft?.body).toBe('Hello offline');
    expect(draft?.status).toBe('queued');
  });

  it('queries drafts by senderId', async () => {
    await db.draftMessages.bulkAdd([
      {
        id: 'dm1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        body: 'a',
        status: 'queued',
        lastError: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'dm2',
        conversationId: 'conv-1',
        senderId: 'user-1',
        body: 'b',
        status: 'failed',
        lastError: 'oops',
        createdAt: '2026-01-01T00:00:01Z',
      },
      {
        id: 'dm3',
        conversationId: 'conv-2',
        senderId: 'user-2',
        body: 'c',
        status: 'queued',
        lastError: null,
        createdAt: '2026-01-01T00:00:02Z',
      },
    ]);

    const ownDrafts = await db.draftMessages.where('senderId').equals('user-1').toArray();
    expect(ownDrafts).toHaveLength(2);
  });
});
```

Add the import this new `describe` block needs at the top of `src/lib/db.test.ts` — the file already imports `db` from `./db`, so no import changes are needed there; the new block only uses `db`, `describe`, `it`, `expect`, `beforeEach`, all already imported.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/db.test.ts`
Expected: FAIL with something like "db.draftMessages is undefined" (the table doesn't exist yet).

- [ ] **Step 3: Add the table**

Replace the full contents of `src/lib/db.ts`:

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

export interface DraftMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  mediaBlob?: { blob: Blob; mediaType: 'photo' };
  status: 'queued' | 'syncing' | 'failed';
  lastError: string | null;
  createdAt: string;
}

export class PiMeshDB extends Dexie {
  queryCache!: Table<CachedQueryClient, string>;
  draftPosts!: Table<DraftPost, string>;
  draftMessages!: Table<DraftMessage, string>;

  constructor() {
    super('pimesh');
    this.version(1).stores({
      queryCache: 'key',
    });
    this.version(2).stores({
      queryCache: 'key',
      draftPosts: 'id, authorId, status',
    });
    this.version(3).stores({
      queryCache: 'key',
      draftPosts: 'id, authorId, status',
      draftMessages: 'id, senderId, conversationId, status',
    });
  }
}

export const db = new PiMeshDB();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/db.test.ts`
Expected: PASS (4 tests: 2 existing `draftPosts` tests + 2 new `draftMessages` tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: add draftMessages Dexie table (schema v3)"
```

---

### Task 2: `messageQueue.ts` module

**Files:**
- Create: `src/lib/messageQueue.ts`
- Test: `src/lib/messageQueue.test.ts`

**Interfaces:**
- Consumes: `DraftMessage` (Task 1), `public.messages` table + `message-media` Storage bucket (both already exist from Messaging Plan 1).
- Produces: `queueDraftMessage(input): Promise<string>`, `processMessageQueue(): Promise<void>`, `retryDraftMessage(draftId: string): Promise<void>`. Relied on by Tasks 3 and 6.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/messageQueue.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { queueDraftMessage, processMessageQueue } from './messageQueue';
import { db } from './db';

// jsdom's Blob polyfill isn't recognized by Node's native structuredClone,
// which fake-indexeddb uses to clone values on insertion — round-tripping a
// jsdom Blob through Dexie silently strips it down to `{}`. Swap in Node's
// spec-compliant Blob for this test file only so IndexedDB storage preserves
// the blob's bytes/type, matching real-browser IndexedDB behavior. Imported
// via a dynamic, non-literal specifier so it resolves at runtime without
// requiring Node's ambient module types (this project's tsconfig only
// includes "vite/client").
const bufferModuleSpecifier = 'node:buffer';
beforeAll(async () => {
  const { Blob: NodeBlob } = await import(bufferModuleSpecifier);
  globalThis.Blob = NodeBlob;
});

const mockMessageInsert = vi.fn();
const mockUpload = vi.fn().mockResolvedValue({ error: null });
const mockGetPublicUrl = vi.fn(() => ({
  data: { publicUrl: 'https://example.com/message-media/conv-1/draft-1.jpg' },
}));
const mockGetSession = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
    from: () => ({ insert: mockMessageInsert }),
    storage: {
      from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }),
    },
  },
}));

describe('messageQueue', () => {
  beforeEach(async () => {
    await db.draftMessages.clear();
    mockMessageInsert.mockReset().mockResolvedValue({ error: null });
    mockUpload.mockClear().mockResolvedValue({ error: null });
    mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  });

  it('queues a draft message with status queued', async () => {
    const id = await queueDraftMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      body: 'Hello offline',
    });

    const draft = await db.draftMessages.get(id);
    expect(draft?.status).toBe('queued');
    expect(draft?.body).toBe('Hello offline');
    expect(draft?.conversationId).toBe('conv-1');
  });

  it('syncs a queued text draft and removes it from the queue on success', async () => {
    const id = await queueDraftMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      body: 'Hello offline',
    });

    await processMessageQueue();

    expect(mockMessageInsert).toHaveBeenCalledWith({
      id,
      conversation_id: 'conv-1',
      sender_id: 'user-1',
      body: 'Hello offline',
      media_url: null,
    });
    expect(await db.draftMessages.get(id)).toBeUndefined();
  });

  it('uploads queued media before inserting, with the final media_url already set (never insert-then-update)', async () => {
    const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
    const id = await queueDraftMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      body: null,
      mediaBlob: { blob, mediaType: 'photo' },
    });

    await processMessageQueue();

    expect(mockUpload).toHaveBeenCalledWith(`conv-1/${id}.jpeg`, blob);
    expect(mockMessageInsert).toHaveBeenCalledWith({
      id,
      conversation_id: 'conv-1',
      sender_id: 'user-1',
      body: null,
      media_url: 'https://example.com/message-media/conv-1/draft-1.jpg',
    });
    // Upload must happen before the insert, not after — the insert call
    // args above already carry the uploaded file's URL, which is only
    // possible if upload resolved first in the same synchronous chain.
    expect(mockUpload.mock.invocationCallOrder[0]).toBeLessThan(
      mockMessageInsert.mock.invocationCallOrder[0]
    );
  });

  it('only syncs a draft once when processMessageQueue is called concurrently', async () => {
    await queueDraftMessage({ conversationId: 'conv-1', senderId: 'user-1', body: 'Hello offline' });

    mockMessageInsert.mockClear();

    await Promise.all([processMessageQueue(), processMessageQueue()]);

    expect(mockMessageInsert).toHaveBeenCalledTimes(1);
  });

  it('marks a draft as failed with an error message when sync fails, leaving it in the table', async () => {
    mockMessageInsert.mockResolvedValueOnce({ error: { message: 'network error' } });

    const id = await queueDraftMessage({ conversationId: 'conv-1', senderId: 'user-1', body: 'Will fail' });

    await processMessageQueue();

    const draft = await db.draftMessages.get(id);
    expect(draft?.status).toBe('failed');
    expect(draft?.lastError).toBe('network error');
  });

  it('skips a draft belonging to a different user, leaving it untouched', async () => {
    const id = await queueDraftMessage({ conversationId: 'conv-1', senderId: 'user-2', body: 'Not mine' });

    await processMessageQueue();

    expect(mockMessageInsert).not.toHaveBeenCalled();
    const draft = await db.draftMessages.get(id);
    expect(draft?.status).toBe('queued');
  });

  it('recovers a stale syncing draft left over from a previous session', async () => {
    const id = await queueDraftMessage({ conversationId: 'conv-1', senderId: 'user-1', body: 'Stuck mid-sync' });
    await db.draftMessages.update(id, { status: 'syncing' });

    await processMessageQueue();

    expect(mockMessageInsert).toHaveBeenCalledWith({
      id,
      conversation_id: 'conv-1',
      sender_id: 'user-1',
      body: 'Stuck mid-sync',
      media_url: null,
    });
    expect(await db.draftMessages.get(id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/messageQueue.test.ts`
Expected: FAIL with "Cannot find module './messageQueue'" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/messageQueue.ts`:

```ts
import { supabase } from './supabase';
import { db, type DraftMessage } from './db';

type QueueDraftMessageInput = Omit<DraftMessage, 'id' | 'status' | 'lastError' | 'createdAt'>;

// Supabase/PostgREST errors are plain objects with a `message` field and are
// not always `instanceof Error` (e.g. across mock/realm boundaries), so check
// for a string `message` property rather than relying on the Error prototype.
function extractErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'Something went wrong.';
}

export async function queueDraftMessage(input: QueueDraftMessageInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.draftMessages.add({
    ...input,
    id,
    status: 'queued',
    lastError: null,
    createdAt: new Date().toISOString(),
  });
  return id;
}

let isProcessing = false;

export async function processMessageQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    // Include stale 'syncing' drafts so a draft left mid-sync by a crashed or
    // closed tab in a previous app session gets picked back up here. The
    // isProcessing guard above already prevents two concurrent
    // processMessageQueue() calls within this running app from racing on the
    // same draft, so re-querying 'syncing' is safe — it only ever recovers
    // orphaned state from a previous session, never a live concurrent one.
    const pending = await db.draftMessages.where('status').anyOf(['queued', 'syncing']).toArray();
    // Only sync drafts that belong to whoever is currently logged in. On a
    // shared device another user's queued/syncing drafts may still be
    // sitting in the local Dexie store; leave them untouched (don't mark
    // failed) so they're picked up correctly once their actual owner runs
    // processMessageQueue().
    const ownDrafts = pending.filter((draft) => draft.senderId === session.user.id);

    for (const draft of ownDrafts) {
      await db.draftMessages.update(draft.id, { status: 'syncing' });

      try {
        let mediaUrl: string | null = null;

        if (draft.mediaBlob) {
          const extension = draft.mediaBlob.blob.type.split('/')[1] || 'jpg';
          const path = `${draft.conversationId}/${draft.id}.${extension}`;

          const { error: uploadError } = await supabase.storage
            .from('message-media')
            .upload(path, draft.mediaBlob.blob);
          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage.from('message-media').getPublicUrl(path);
          mediaUrl = publicUrlData.publicUrl;
        }

        const { error: insertError } = await supabase.from('messages').insert({
          id: draft.id,
          conversation_id: draft.conversationId,
          sender_id: draft.senderId,
          body: draft.body,
          media_url: mediaUrl,
        });
        if (insertError) throw insertError;

        await db.draftMessages.delete(draft.id);
      } catch (error) {
        await db.draftMessages.update(draft.id, {
          status: 'failed',
          lastError: extractErrorMessage(error),
        });
      }
    }
  } finally {
    isProcessing = false;
  }
}

export async function retryDraftMessage(draftId: string): Promise<void> {
  await db.draftMessages.update(draftId, { status: 'queued', lastError: null });
  await processMessageQueue();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/messageQueue.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/messageQueue.ts src/lib/messageQueue.test.ts
git commit -m "feat: add messageQueue module for offline-first message sending"
```

---

### Task 3: Extend `useOfflineSync` to drive the message queue

**Files:**
- Modify: `src/hooks/useOfflineSync.ts`
- Test: `src/hooks/useOfflineSync.test.tsx`
- Modify: `src/components/nav/AppShell.test.tsx`

**Interfaces:**
- Consumes: `processMessageQueue` (Task 2).
- Produces: `useOfflineSync()` now also syncs queued messages on the same mount/reconnect triggers it already used for posts. No new exported signature — same zero-argument hook as before.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/hooks/useOfflineSync.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOfflineSync } from './useOfflineSync';
import { useOnlineStatus } from './useOnlineStatus';
import { processQueue } from '../lib/offlineQueue';
import { processMessageQueue } from '../lib/messageQueue';

vi.mock('./useOnlineStatus');
vi.mock('../lib/offlineQueue', () => ({
  processQueue: vi.fn(),
}));
vi.mock('../lib/messageQueue', () => ({
  processMessageQueue: vi.fn(),
}));

const mockUseOnlineStatus = vi.mocked(useOnlineStatus);
const mockProcessQueue = vi.mocked(processQueue);
const mockProcessMessageQueue = vi.mocked(processMessageQueue);

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
    mockProcessMessageQueue.mockReset().mockResolvedValue(undefined);
  });

  it('runs processQueue and processMessageQueue on mount when online', () => {
    mockUseOnlineStatus.mockReturnValue(true);
    renderInProvider();
    expect(mockProcessQueue).toHaveBeenCalledTimes(1);
    expect(mockProcessMessageQueue).toHaveBeenCalledTimes(1);
  });

  it('does not run either queue on mount when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false);
    renderInProvider();
    expect(mockProcessQueue).not.toHaveBeenCalled();
    expect(mockProcessMessageQueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/useOfflineSync.test.tsx`
Expected: FAIL — `processMessageQueue` import from `../lib/messageQueue` doesn't exist as a mock target yet meaningfully (the module exists after Task 2, but `useOfflineSync.ts` doesn't call it yet, so `mockProcessMessageQueue` is never invoked).

- [ ] **Step 3: Update the implementation**

Replace the full contents of `src/hooks/useOfflineSync.ts`:

```ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from './useOnlineStatus';
import { processQueue } from '../lib/offlineQueue';
import { processMessageQueue } from '../lib/messageQueue';

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOnline) return;
    processQueue().then(() => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    });
    processMessageQueue().then(() => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['message-drafts'] });
    });
  }, [isOnline, queryClient]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/useOfflineSync.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Fix the AppShell hidden-consumer gap**

`src/components/nav/AppShell.test.tsx` already has a block mocking `../../lib/offlineQueue` (for the existing `processQueue` call inside `useOfflineSync`). Find that block and add an equivalent mock for `../../lib/messageQueue` right next to it:

```ts
vi.mock('../../lib/messageQueue', () => ({
  processMessageQueue: vi.fn().mockResolvedValue(undefined),
}));
```

Add this immediately after the existing `vi.mock('../../lib/offlineQueue', ...)` block in `src/components/nav/AppShell.test.tsx`. Without it, every test in that file will fail once `useOfflineSync` (Step 3 above) imports the real `../../lib/messageQueue`, since that module calls `supabase.auth.getSession()` and other unmocked Supabase calls the test environment isn't set up for.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: All test files pass, including `src/components/nav/AppShell.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useOfflineSync.ts src/hooks/useOfflineSync.test.tsx src/components/nav/AppShell.test.tsx
git commit -m "feat: drive message queue sync from useOfflineSync alongside posts"
```

---

### Task 4: `useQueuedMessageDrafts` hook

**Files:**
- Create: `src/hooks/useQueuedMessageDrafts.ts`
- Test: `src/hooks/useQueuedMessageDrafts.test.tsx`

**Interfaces:**
- Consumes: `DraftMessage` (Task 1).
- Produces: `useQueuedMessageDrafts(senderId: string | undefined)` → `UseQueryResult<DraftMessage[]>`, sorted oldest-first, scoped to the given sender across *all* their conversations (per-conversation filtering happens at the call site in Task 6, exactly mirroring how `useQueuedDrafts` returns all of a user's post drafts and `FeedPage`/`ChannelPage` filter locally by `cityId`/`channelId`). Relied on by Task 6.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useQueuedMessageDrafts.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useQueuedMessageDrafts } from './useQueuedMessageDrafts';
import { db } from '../lib/db';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useQueuedMessageDrafts', () => {
  beforeEach(async () => {
    await db.draftMessages.clear();
  });

  it("returns only the given sender's drafts across all conversations, oldest first", async () => {
    await db.draftMessages.bulkAdd([
      {
        id: 'dm2',
        conversationId: 'conv-1',
        senderId: 'user-1',
        body: 'second',
        status: 'queued',
        lastError: null,
        createdAt: '2026-01-01T00:00:05Z',
      },
      {
        id: 'dm1',
        conversationId: 'conv-2',
        senderId: 'user-1',
        body: 'first',
        status: 'queued',
        lastError: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'dm3',
        conversationId: 'conv-1',
        senderId: 'user-2',
        body: 'someone else',
        status: 'queued',
        lastError: null,
        createdAt: '2026-01-01T00:00:01Z',
      },
    ]);

    const { result } = renderHook(() => useQueuedMessageDrafts('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].body).toBe('first');
    expect(result.current.data?.[1].body).toBe('second');
  });

  it('returns an empty array when there is no sender', async () => {
    const { result } = renderHook(() => useQueuedMessageDrafts(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/useQueuedMessageDrafts.test.tsx`
Expected: FAIL with "Cannot find module './useQueuedMessageDrafts'" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useQueuedMessageDrafts.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { db, type DraftMessage } from '../lib/db';

export function useQueuedMessageDrafts(senderId: string | undefined) {
  return useQuery({
    queryKey: ['message-drafts', senderId],
    queryFn: async (): Promise<DraftMessage[]> => {
      const drafts = await db.draftMessages.where('senderId').equals(senderId || '').toArray();
      return drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    refetchInterval: senderId ? 2000 : false,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/useQueuedMessageDrafts.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useQueuedMessageDrafts.ts src/hooks/useQueuedMessageDrafts.test.tsx
git commit -m "feat: add useQueuedMessageDrafts hook"
```

---

### Task 5: `DraftMessageBubble` component

**Files:**
- Create: `src/components/messages/DraftMessageBubble.tsx`
- Test: `src/components/messages/DraftMessageBubble.test.tsx`

**Interfaces:**
- Consumes: `DraftMessage` (Task 1), `retryDraftMessage` (Task 2).
- Produces: `DraftMessageBubble({ draft }: { draft: DraftMessage })`. Relied on by Task 6.

A queued/syncing/failed message is always the *viewer's own* outgoing message (you can only draft-queue messages you're sending), so this renders as a right-aligned bubble matching `ConversationPage`'s existing "own message" bubble style (`rounded-br-sm bg-primary text-primary-foreground`), the same way `DraftPostCard` matches the surrounding card style in the Feed.

- [ ] **Step 1: Write the failing test**

Create `src/components/messages/DraftMessageBubble.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftMessageBubble } from './DraftMessageBubble';
import { retryDraftMessage } from '../../lib/messageQueue';
import type { DraftMessage } from '../../lib/db';

vi.mock('../../lib/messageQueue', () => ({
  retryDraftMessage: vi.fn(),
}));

const mockRetryDraftMessage = vi.mocked(retryDraftMessage);

const baseDraft: DraftMessage = {
  id: 'draft-msg-1',
  conversationId: 'conv-1',
  senderId: 'user-1',
  body: 'Hello offline',
  status: 'queued',
  lastError: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('DraftMessageBubble', () => {
  it('shows the message body and "Sending…" for a queued draft', () => {
    render(<DraftMessageBubble draft={baseDraft} />);
    expect(screen.getByText('Hello offline')).toBeInTheDocument();
    expect(screen.getByText('Sending…')).toBeInTheDocument();
  });

  it('shows "Sending…" for a syncing draft too', () => {
    render(<DraftMessageBubble draft={{ ...baseDraft, status: 'syncing' }} />);
    expect(screen.getByText('Sending…')).toBeInTheDocument();
  });

  it('shows the error and a Retry button for a failed draft, which calls retryDraftMessage when clicked', async () => {
    render(<DraftMessageBubble draft={{ ...baseDraft, status: 'failed', lastError: 'network error' }} />);

    expect(screen.getByText("Couldn't send: network error")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mockRetryDraftMessage).toHaveBeenCalledWith('draft-msg-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/messages/DraftMessageBubble.test.tsx`
Expected: FAIL with "Cannot find module './DraftMessageBubble'" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/components/messages/DraftMessageBubble.tsx`:

```tsx
import { retryDraftMessage } from '../../lib/messageQueue';
import { Button } from '@/components/ui/button';
import type { DraftMessage } from '../../lib/db';

export function DraftMessageBubble({ draft }: { draft: DraftMessage }) {
  return (
    <div className="flex flex-col items-end gap-1 self-end">
      <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground opacity-80">
        {draft.body && <p className="whitespace-pre-wrap">{draft.body}</p>}
      </div>
      {(draft.status === 'queued' || draft.status === 'syncing') && (
        <p className="text-xs text-muted-foreground">Sending…</p>
      )}
      {draft.status === 'failed' && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-destructive">Couldn't send: {draft.lastError}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => retryDraftMessage(draft.id)}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/messages/DraftMessageBubble.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/messages/DraftMessageBubble.tsx src/components/messages/DraftMessageBubble.test.tsx
git commit -m "feat: add DraftMessageBubble component"
```

---

### Task 6: Wire the composer through the queue in `ConversationPage`

**Files:**
- Modify: `src/routes/ConversationPage.tsx`
- Modify: `src/routes/ConversationPage.test.tsx`

**Interfaces:**
- Consumes: `queueDraftMessage` (Task 2), `useQueuedMessageDrafts` (Task 4), `DraftMessageBubble` (Task 5).
- Produces: the final `/messages/:conversationId` page — no further tasks in this plan depend on it.

- [ ] **Step 1: Update the failing tests**

In `src/routes/ConversationPage.test.tsx`, make these changes to the existing file:

1. Add these two imports at the top, alongside the existing ones:

```tsx
import { queueDraftMessage } from '../lib/messageQueue';
import { useQueuedMessageDrafts } from '../hooks/useQueuedMessageDrafts';
```

2. Add these two mocks, alongside the existing `vi.mock` calls:

```tsx
vi.mock('../lib/messageQueue', () => ({
  queueDraftMessage: vi.fn(),
}));
vi.mock('../hooks/useQueuedMessageDrafts');
```

3. Add these two mocked references, alongside the existing `mockUse*` consts:

```tsx
const mockQueueDraftMessage = vi.mocked(queueDraftMessage);
const mockUseQueuedMessageDrafts = vi.mocked(useQueuedMessageDrafts);
```

4. In the `beforeEach` block, add a default mock return so every test has one unless it overrides it:

```tsx
mockUseQueuedMessageDrafts.mockReturnValue({ data: [] } as any);
mockQueueDraftMessage.mockReset().mockResolvedValue('draft-1');
```

5. Replace the two existing send-flow tests (`'sends a text message and clears the input'` and `'does not send an empty message with no text and no photo'`) with:

```tsx
  it('queues a draft message and clears the input on submit', async () => {
    renderAt('/messages/conv-1');

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Message…');
    await user.type(input, 'Hello!');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mockQueueDraftMessage).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        senderId: 'user-1',
        body: 'Hello!',
        mediaBlob: undefined,
      })
    );
    expect(input).toHaveValue('');
  });

  it('does not queue a draft with no text and no photo', async () => {
    renderAt('/messages/conv-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(mockQueueDraftMessage).not.toHaveBeenCalled();
  });

  it('renders a queued draft as a bubble among the real messages', async () => {
    mockUseQueuedMessageDrafts.mockReturnValue({
      data: [
        {
          id: 'draft-1',
          conversationId: 'conv-1',
          senderId: 'user-1',
          body: 'Still sending this',
          status: 'queued',
          lastError: null,
          createdAt: '2026-01-01T00:02:00Z',
        },
      ],
    } as any);

    renderAt('/messages/conv-1');

    await waitFor(() => expect(screen.getByText('Still sending this')).toBeInTheDocument());
    expect(screen.getByText('Sending…')).toBeInTheDocument();
  });

  it("does not render another conversation's draft here", async () => {
    mockUseQueuedMessageDrafts.mockReturnValue({
      data: [
        {
          id: 'draft-1',
          conversationId: 'conv-OTHER',
          senderId: 'user-1',
          body: 'Wrong thread',
          status: 'queued',
          lastError: null,
          createdAt: '2026-01-01T00:02:00Z',
        },
      ],
    } as any);

    renderAt('/messages/conv-1');
    await waitFor(() => expect(screen.getByPlaceholderText('Message…')).toBeInTheDocument());
    expect(screen.queryByText('Wrong thread')).not.toBeInTheDocument();
  });
```

Do not remove any of the other existing tests in this file (the display-name, photo, sender-labeling, and mark-as-read tests all stay as they are). The `renderAt` helper, `Bob`/`Other`-style fixture names, and the exact shape of the `useConversation`/`useMessages` mocks referenced implicitly above are whatever the existing file already defines — read the current file before editing it; nothing in this task depends on their exact values.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/routes/ConversationPage.test.tsx`
Expected: FAIL — `ConversationPage` still calls `useSendMessage` directly and doesn't render any draft bubbles yet.

- [ ] **Step 3: Update the implementation**

Replace the full contents of `src/routes/ConversationPage.tsx`:

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useMessages } from '../hooks/useMessages';
import { useConversation } from '../hooks/useConversations';
import { useMarkAsRead } from '../hooks/useMessageActions';
import { useQueuedMessageDrafts } from '../hooks/useQueuedMessageDrafts';
import { queueDraftMessage, processMessageQueue } from '../lib/messageQueue';
import { getConversationDisplayName, getConversationAvatarUrl } from '../lib/conversationDisplay';
import { NodeAvatar } from '../components/NodeAvatar';
import { DraftMessageBubble } from '../components/messages/DraftMessageBubble';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { session } = useAuth();
  const { data: conversation } = useConversation(conversationId, session?.user.id);
  const { data: messages, isLoading } = useMessages(conversationId);
  const { data: drafts } = useQueuedMessageDrafts(session?.user.id);
  const markAsRead = useMarkAsRead();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!conversationId || !session?.user.id) return;
    markAsRead.mutate({ conversationId, userId: session.user.id });
  }, [conversationId, session?.user.id]);

  const senderNames = new Map((conversation?.participants ?? []).map((p) => [p.user_id, p.display_name]));
  const senderAvatars = new Map((conversation?.participants ?? []).map((p) => [p.user_id, p.avatar_url]));
  const conversationName = conversation ? getConversationDisplayName(conversation) : 'Conversation';
  const conversationAvatarUrl = conversation ? getConversationAvatarUrl(conversation) : null;
  const ownDrafts = (drafts ?? []).filter((draft) => draft.conversationId === conversationId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!conversationId || !session?.user.id) return;
    if (!body.trim() && !mediaFile) return;

    setSubmitting(true);
    try {
      await queueDraftMessage({
        conversationId,
        senderId: session.user.id,
        body: body.trim() || null,
        mediaBlob: mediaFile ? { blob: mediaFile, mediaType: 'photo' } : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['message-drafts', session.user.id] });
      setBody('');
      setMediaFile(undefined);
      if (fileInputRef.current) fileInputRef.current.value = '';

      processMessageQueue().then(() => {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['conversations', session.user.id] });
        queryClient.invalidateQueries({ queryKey: ['message-drafts', session.user.id] });
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!conversationId) return null;

  return (
    <div className="mx-auto flex max-w-xl flex-col p-4">
      <div className="mb-4 flex items-center gap-3">
        <NodeAvatar name={conversationName} avatarUrl={conversationAvatarUrl} size={36} />
        <h1 className="min-w-0 flex-1 truncate font-display text-base font-semibold md:text-xl">
          {conversationName}
        </h1>
      </div>
      {isLoading && <p className="text-muted-foreground">Loading messages…</p>}
      <div className="flex flex-col gap-3 pb-36 md:pb-24">
        {messages?.map((message) => {
          const isOwn = message.sender_id === session?.user.id;
          return (
            <div
              key={message.id}
              className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse self-end' : 'self-start'}`}
            >
              {!isOwn && (
                <NodeAvatar
                  name={senderNames.get(message.sender_id) ?? 'Unknown'}
                  avatarUrl={senderAvatars.get(message.sender_id)}
                  size={28}
                />
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                  isOwn
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm border border-border bg-card'
                }`}
              >
                {!isOwn && (
                  <p className="font-display text-xs font-medium opacity-70">
                    {senderNames.get(message.sender_id) ?? 'Unknown'}
                  </p>
                )}
                {message.body && <p>{message.body}</p>}
                {message.media_url && (
                  <img src={message.media_url} alt="" className="mt-1 max-w-full rounded-lg" />
                )}
                <p
                  className={`mt-1 font-mono text-[10px] ${
                    isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  }`}
                >
                  {formatTime(message.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        {ownDrafts.map((draft) => (
          <DraftMessageBubble key={draft.id} draft={draft} />
        ))}
      </div>
      <form
        onSubmit={handleSubmit}
        className="fixed inset-x-0 bottom-16 z-10 mx-auto flex max-w-xl flex-col gap-2 rounded-lg border bg-card p-2 px-4 shadow-md md:inset-x-auto md:bottom-4 md:left-56 md:right-0 md:px-4"
      >
        {mediaFile && (
          <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            <span className="truncate">{mediaFile.name}</span>
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => {
                setMediaFile(undefined);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Photo"
            className="hidden"
            onChange={(event) => setMediaFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Attach photo"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={18} />
          </Button>
          <Input
            placeholder="Message…"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={submitting} className="shrink-0">
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
```

Note: `useSendMessage` and `useMarkAsRead` were previously imported together from `../hooks/useMessageActions`; this version only imports `useMarkAsRead` from there (per this plan's Global Constraints, `useSendMessage` itself is untouched in `useMessageActions.ts` — it's just no longer imported here).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/routes/ConversationPage.test.tsx`
Expected: PASS (all tests in the file, including the 4 new/rewritten ones).

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test`
Expected: all test files pass.

Run: `npm run build`
Expected: TypeScript and Vite build both succeed with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/ConversationPage.tsx src/routes/ConversationPage.test.tsx
git commit -m "feat: send messages draft-first through the offline queue"
```

---

## Final Whole-Branch Review

After Task 6, dispatch a final whole-branch code review (most capable model) covering the full diff from before Task 1 through Task 6. Pay particular attention to:

- **Session-scoping and orphan recovery in `processMessageQueue`** (Task 2) — re-verify by hand-tracing (not just reading the test names) that a draft belonging to a different `senderId` than the current session is genuinely never touched, and that a `syncing`-status orphan from a crashed tab is genuinely picked back up on the next `processMessageQueue()` call.
- **Constraint-ordering** (Task 2) — confirm the shipped code truly uploads media before the `messages` insert, and that the insert always carries the final `media_url` in one shot, matching the Global Constraint and the established MSG1-Task 8 precedent.
- **The `useSendMessage` dead-code decision** (Global Constraints) — confirm it's still present in `src/hooks/useMessageActions.ts`, unused but intact, not silently deleted along the way.
- **Per-conversation draft filtering in `ConversationPage`** (Task 6) — confirm a draft queued in one conversation genuinely never renders in a different conversation's thread (the dedicated test in Task 6 covers this, but re-verify the filter logic itself, not just that one test passes).
- Whether `AppShell.test.tsx`'s new `../../lib/messageQueue` mock (Task 3) is still in place and the full suite is clean.

Once the final review is clean, use `superpowers:finishing-a-development-branch` to wrap up.
