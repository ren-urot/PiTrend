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
