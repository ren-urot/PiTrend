import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommentThread } from './CommentThread';
import { useComments } from '../../hooks/useComments';
import { useCreateComment } from '../../hooks/useCreateComment';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../hooks/useComments');
vi.mock('../../hooks/useCreateComment');

const mockUseComments = vi.mocked(useComments);
const mockUseCreateComment = vi.mocked(useCreateComment);
const mockMutateAsync = vi.fn().mockResolvedValue(undefined);

function renderThread() {
  mockUseCreateComment.mockReturnValue({ mutateAsync: mockMutateAsync } as any);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <CommentThread postId="post-1" />
    </QueryClientProvider>
  );
}

describe('CommentThread', () => {
  it('renders top-level comments and their nested replies', () => {
    mockUseComments.mockReturnValue({
      data: [
        {
          id: 'c1',
          post_id: 'post-1',
          author_id: 'user-1',
          parent_comment_id: null,
          body: 'Top level comment',
          created_at: '2026-01-01T00:00:00Z',
          author: { username: 'renz', display_name: 'Ren', avatar_url: null },
        },
        {
          id: 'c2',
          post_id: 'post-1',
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
    mockUseComments.mockReturnValue({ data: [], isLoading: false } as any);
    renderThread();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Write a comment…'), 'My comment');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        postId: 'post-1',
        authorId: 'user-1',
        parentCommentId: null,
        body: 'My comment',
      })
    );
  });
});
