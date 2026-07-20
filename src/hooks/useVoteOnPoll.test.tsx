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
