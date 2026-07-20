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

const mockVoteOnPollMutate = vi.fn();

vi.mock('../../hooks/useVoteOnPoll', () => ({
  useVoteOnPoll: () => ({ mutate: mockVoteOnPollMutate }),
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

  it('renders buy & sell price, currency, and category', () => {
    renderCard({
      post_type: 'buy_sell',
      buy_sell: { price_amount: 3500, price_currency: 'PHP', category: 'Vehicles' },
    });
    expect(screen.getByText('PHP 3500 · Vehicles')).toBeInTheDocument();
  });

  it('renders poll options as vote buttons before the viewer has voted', () => {
    renderCard({
      post_type: 'poll',
      poll: {
        options: [
          { id: 'opt-1', option_text: 'CnT', display_order: 0, vote_count: 3 },
          { id: 'opt-2', option_text: "Rico's", display_order: 1, vote_count: 1 },
        ],
        viewer_vote_option_id: null,
      },
    });
    expect(screen.getByRole('button', { name: 'CnT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Rico's" })).toBeInTheDocument();
  });

  it('renders poll results after the viewer has voted', () => {
    renderCard({
      post_type: 'poll',
      poll: {
        options: [
          { id: 'opt-1', option_text: 'CnT', display_order: 0, vote_count: 3 },
          { id: 'opt-2', option_text: "Rico's", display_order: 1, vote_count: 1 },
        ],
        viewer_vote_option_id: 'opt-1',
      },
    });
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CnT' })).not.toBeInTheDocument();
  });

  it('casts a vote when an unvoted poll option is clicked', async () => {
    renderCard({
      post_type: 'poll',
      poll: {
        options: [{ id: 'opt-1', option_text: 'CnT', display_order: 0, vote_count: 0 }],
        viewer_vote_option_id: null,
      },
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'CnT' }));

    expect(mockVoteOnPollMutate).toHaveBeenCalledWith({
      postId: 'post-1',
      pollOptionId: 'opt-1',
      voterId: 'user-1',
      cityId: 'city-1',
      channelId: null,
    });
  });
});
