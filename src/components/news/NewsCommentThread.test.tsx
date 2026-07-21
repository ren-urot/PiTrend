import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NewsCommentThread } from './NewsCommentThread';
import { useNewsComments } from '../../hooks/useNewsComments';
import { useCreateNewsComment } from '../../hooks/useCreateNewsComment';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../hooks/useNewsComments');
vi.mock('../../hooks/useCreateNewsComment');

const mockUseNewsComments = vi.mocked(useNewsComments);
const mockUseCreateNewsComment = vi.mocked(useCreateNewsComment);
const mockMutateAsync = vi.fn().mockResolvedValue(undefined);

function renderThread() {
  mockUseCreateNewsComment.mockReturnValue({ mutateAsync: mockMutateAsync } as any);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <NewsCommentThread articleId="article-1" />
    </QueryClientProvider>
  );
}

describe('NewsCommentThread', () => {
  it('renders top-level comments and their nested replies', () => {
    mockUseNewsComments.mockReturnValue({
      data: [
        {
          id: 'c1',
          article_id: 'article-1',
          author_id: 'user-1',
          parent_comment_id: null,
          body: 'Top level comment',
          created_at: '2026-01-01T00:00:00Z',
          author: { username: 'renz', display_name: 'Ren', avatar_url: null },
        },
        {
          id: 'c2',
          article_id: 'article-1',
          author_id: 'user-2',
          parent_comment_id: 'c1',
          body: 'A nested reply',
          created_at: '2026-01-01T00:01:00Z',
          author: { username: 'other', display_name: 'Other', avatar_url: null },
        },
      ],
      isLoading: false,
    } as any);

    renderThread();

    expect(screen.getByText('Top level comment')).toBeInTheDocument();
    expect(screen.getByText('A nested reply')).toBeInTheDocument();
  });

  it('submits a new top-level comment', async () => {
    mockUseNewsComments.mockReturnValue({ data: [], isLoading: false } as any);
    renderThread();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Write a comment…'), 'My comment');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        articleId: 'article-1',
        authorId: 'user-1',
        parentCommentId: null,
        body: 'My comment',
      })
    );
  });
});
