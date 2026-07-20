import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useToggleChannelSubscription } from './useToggleChannelSubscription';

const mockDeleteEqUser = vi.fn().mockResolvedValue({ error: null });
const mockDeleteEqChannel = vi.fn(() => ({ eq: mockDeleteEqUser }));
const mockDelete = vi.fn(() => ({ eq: mockDeleteEqChannel }));
const mockInsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ delete: mockDelete, insert: mockInsert }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useToggleChannelSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a subscription when not currently subscribed', async () => {
    const { result } = renderHook(() => useToggleChannelSubscription(), { wrapper });

    result.current.mutate({ channelId: 'ch-1', userId: 'user-1', isSubscribed: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({ channel_id: 'ch-1', user_id: 'user-1' });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes the subscription when currently subscribed', async () => {
    const { result } = renderHook(() => useToggleChannelSubscription(), { wrapper });

    result.current.mutate({ channelId: 'ch-1', userId: 'user-1', isSubscribed: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteEqChannel).toHaveBeenCalledWith('channel_id', 'ch-1');
    expect(mockDeleteEqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
