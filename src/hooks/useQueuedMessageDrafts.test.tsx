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
