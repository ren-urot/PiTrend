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
