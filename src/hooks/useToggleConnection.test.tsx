import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useToggleConnection } from './useToggleConnection';

const mockDeleteEqFollowed = vi.fn();
const mockDeleteEqFollower = vi.fn(() => ({ eq: mockDeleteEqFollowed }));
const mockDelete = vi.fn(() => ({ eq: mockDeleteEqFollower }));
const mockInsert = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ delete: mockDelete, insert: mockInsert }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useToggleConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    mockDeleteEqFollowed.mockResolvedValue({ error: null });
  });

  it('inserts a connection when not currently followed', async () => {
    const { result } = renderHook(() => useToggleConnection(), { wrapper });

    result.current.mutate({ followerId: 'user-1', followedId: 'user-2', isFollowing: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({ follower_id: 'user-1', followed_id: 'user-2' });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes the connection when currently followed', async () => {
    const { result } = renderHook(() => useToggleConnection(), { wrapper });

    result.current.mutate({ followerId: 'user-1', followedId: 'user-2', isFollowing: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteEqFollower).toHaveBeenCalledWith('follower_id', 'user-1');
    expect(mockDeleteEqFollowed).toHaveBeenCalledWith('followed_id', 'user-2');
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
