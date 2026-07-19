import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useToggleBookmark } from './useToggleBookmark';

const mockDeleteEqUser = vi.fn().mockResolvedValue({ error: null });
const mockDeleteEqPost = vi.fn(() => ({ eq: mockDeleteEqUser }));
const mockDelete = vi.fn(() => ({ eq: mockDeleteEqPost }));
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

describe('useToggleBookmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a bookmark when not currently bookmarked', async () => {
    const { result } = renderHook(() => useToggleBookmark(), { wrapper });

    result.current.mutate({
      postId: 'post-1',
      userId: 'user-1',
      isBookmarked: false,
      cityId: 'city-1',
      channelId: null,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({ post_id: 'post-1', user_id: 'user-1' });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes the bookmark when currently bookmarked', async () => {
    const { result } = renderHook(() => useToggleBookmark(), { wrapper });

    result.current.mutate({
      postId: 'post-1',
      userId: 'user-1',
      isBookmarked: true,
      cityId: 'city-1',
      channelId: null,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteEqPost).toHaveBeenCalledWith('post_id', 'post-1');
    expect(mockDeleteEqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
