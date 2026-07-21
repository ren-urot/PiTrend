import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNewsComments } from './useNewsComments';

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

describe('useNewsComments', () => {
  it('returns comments for an article ordered oldest first', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: 'comment-1',
          article_id: 'article-1',
          author_id: 'user-1',
          parent_comment_id: null,
          body: 'Great article!',
          created_at: '2026-01-01T00:00:00Z',
          author: { username: 'renz', display_name: 'Ren', avatar_url: null },
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useNewsComments('article-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].body).toBe('Great article!');
    expect(mockEq).toHaveBeenCalledWith('article_id', 'article-1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true });
  });
});
