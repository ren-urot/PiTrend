import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { queueDraftPost, processQueue } from './offlineQueue';
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
