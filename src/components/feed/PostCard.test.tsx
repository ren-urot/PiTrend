import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostCard } from './PostCard';
import type { Post } from '../../types/post';

const mockToggleLikeMutate = vi.fn();
const mockToggleBookmarkMutate = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../hooks/useToggleLike', () => ({
  useToggleLike: () => ({ mutate: mockToggleLikeMutate }),
}));

vi.mock('../../hooks/useToggleBookmark', () => ({
  useToggleBookmark: () => ({ mutate: mockToggleBookmarkMutate }),
}));

const post: Post = {
  id: 'post-1',
  author_id: 'user-2',
  city_id: 'city-1',
  channel_id: null,
  post_type: 'text',
  body: 'Hello Cebu!',
  shared_post_id: null,
  created_at: '2026-01-01T00:00:00Z',
  author: { username: 'other', display_name: 'Other User', avatar_url: null },
  post_media: null,
  poll: null,
  buy_sell: null,
  like_count: 3,
  comment_count: 2,
  viewer_has_liked: false,
  viewer_has_bookmarked: false,
};

function renderCard(overrides: Partial<Post> = {}) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <PostCard post={{ ...post, ...overrides }} />
    </QueryClientProvider>
  );
}

describe('PostCard', () => {
  it('renders the post body, author, and like/comment counts', () => {
    renderCard();
    expect(screen.getByText('Hello Cebu!')).toBeInTheDocument();
    expect(screen.getByText('Other User')).toBeInTheDocument();
    expect(screen.getByText('Like (3)')).toBeInTheDocument();
    expect(screen.getByText('Comment (2)')).toBeInTheDocument();
  });

  it('toggles a like when the like button is clicked', async () => {
    renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByText('Like (3)'));

    expect(mockToggleLikeMutate).toHaveBeenCalledWith({
      postId: 'post-1',
      userId: 'user-1',
      isLiked: false,
      cityId: 'city-1',
      channelId: null,
    });
  });
});
