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
