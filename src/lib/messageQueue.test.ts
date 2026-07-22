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
