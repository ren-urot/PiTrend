import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useChannelSubscriptions } from './useChannelSubscriptions';

const mockEq = vi.fn();
const mockSelect = vi.fn(() => ({ eq: mockEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useChannelSubscriptions', () => {
  it('returns the subscribed channel ids for the given user', async () => {
    mockEq.mockResolvedValue({ data: [{ channel_id: 'ch-1' }, { channel_id: 'ch-2' }], error: null });

    const { result } = renderHook(() => useChannelSubscriptions('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(['ch-1', 'ch-2']);
    expect(mockSelect).toHaveBeenCalledWith('channel_id');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
