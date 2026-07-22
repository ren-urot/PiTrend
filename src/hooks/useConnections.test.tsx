import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useConnections } from './useConnections';

const mockOrder = vi.fn();
const mockEq = vi.fn(() => ({ order: mockOrder }));
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

describe('useConnections', () => {
  it("returns the profiles a user follows, newest first", async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          followed_id: 'user-2',
          created_at: '2026-01-02T00:00:00Z',
          profiles: { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null },
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useConnections('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null },
    ]);
    expect(mockEq).toHaveBeenCalledWith('follower_id', 'user-1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns an empty list without querying when there is no userId', async () => {
    const { result } = renderHook(() => useConnections(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
