import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMyFollowedIds } from './useMyFollowedIds';

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

describe('useMyFollowedIds', () => {
  it('returns a set of ids the viewer already follows', async () => {
    mockEq.mockResolvedValue({
      data: [{ followed_id: 'user-2' }, { followed_id: 'user-3' }],
      error: null,
    });

    const { result } = renderHook(() => useMyFollowedIds('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(new Set(['user-2', 'user-3']));
    expect(mockSelect).toHaveBeenCalledWith('followed_id');
    expect(mockEq).toHaveBeenCalledWith('follower_id', 'user-1');
  });

  it('returns an empty set without querying when there is no viewer', async () => {
    const { result } = renderHook(() => useMyFollowedIds(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(new Set());
  });
});
