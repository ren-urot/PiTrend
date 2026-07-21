import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateNewsComment } from './useCreateNewsComment';

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

describe('useCreateNewsComment', () => {
  it('inserts a top-level comment', async () => {
    const { result } = renderHook(() => useCreateNewsComment(), { wrapper });

    result.current.mutate({
      articleId: 'article-1',
      authorId: 'user-1',
      parentCommentId: null,
      body: 'Great article!',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({
      article_id: 'article-1',
      author_id: 'user-1',
      parent_comment_id: null,
      body: 'Great article!',
    });
  });

  it('inserts a nested reply', async () => {
    const { result } = renderHook(() => useCreateNewsComment(), { wrapper });

    result.current.mutate({
      articleId: 'article-1',
      authorId: 'user-2',
      parentCommentId: 'comment-1',
      body: 'I agree!',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith({
      article_id: 'article-1',
      author_id: 'user-2',
      parent_comment_id: 'comment-1',
      body: 'I agree!',
    });
  });
});
