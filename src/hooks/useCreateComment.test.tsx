import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateComment } from './useCreateComment';

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

describe('useCreateComment', () => {
  it('inserts a top-level comment', async () => {
    const { result } = renderHook(() => useCreateComment(), { wrapper });

    result.current.mutate({
      postId: 'post-1',
      authorId: 'user-1',
      parentCommentId: null,
      body: 'Great post!',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({
      post_id: 'post-1',
      author_id: 'user-1',
      parent_comment_id: null,
      body: 'Great post!',
    });
  });

  it('inserts a nested reply', async () => {
    const { result } = renderHook(() => useCreateComment(), { wrapper });

    result.current.mutate({
      postId: 'post-1',
      authorId: 'user-2',
      parentCommentId: 'comment-1',
      body: 'I agree!',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({
      post_id: 'post-1',
      author_id: 'user-2',
      parent_comment_id: 'comment-1',
      body: 'I agree!',
    });
  });
});
