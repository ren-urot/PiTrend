import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePosts } from './usePosts';

const mockPostsData = [
  {
    id: 'post-1',
    author_id: 'user-1',
    city_id: 'city-1',
    channel_id: null,
    post_type: 'poll',
    body: 'Best lechon in town?',
    shared_post_id: null,
    created_at: '2026-01-01T00:00:00Z',
    author: { username: 'renz', display_name: 'Ren', avatar_url: null },
    post_media: null,
    poll_options: [
      { id: 'opt-1', option_text: 'CnT', display_order: 0, poll_votes: [{ count: 3 }] },
      { id: 'opt-2', option_text: 'Rico\'s', display_order: 1, poll_votes: [{ count: 1 }] },
    ],
    post_buy_sell: null,
    likes: [{ count: 0 }],
    comments: [{ count: 0 }],
  },
  {
    id: 'post-2',
    author_id: 'user-2',
    city_id: 'city-1',
    channel_id: null,
    post_type: 'buy_sell',
    body: 'Selling my bike',
    shared_post_id: null,
    created_at: '2026-01-02T00:00:00Z',
    author: { username: 'other', display_name: 'Other', avatar_url: null },
    post_media: null,
    poll_options: [],
    post_buy_sell: { price_amount: 3500, price_currency: 'PHP', category: 'Vehicles' },
    likes: [{ count: 0 }],
    comments: [{ count: 0 }],
  },
];

const mockLimit = vi.fn();
const mockOrder = vi.fn(() => ({ limit: mockLimit }));
const mockIs = vi.fn(() => ({ order: mockOrder }));
const mockEqCity = vi.fn(() => ({ is: mockIs }));
const mockSelect = vi.fn(() => ({ eq: mockEqCity }));

const mockLikesIn = vi.fn().mockResolvedValue({ data: [] });
const mockLikesEq = vi.fn(() => ({ in: mockLikesIn }));
const mockLikesSelect = vi.fn(() => ({ eq: mockLikesEq }));

const mockBookmarksIn = vi.fn().mockResolvedValue({ data: [] });
const mockBookmarksEq = vi.fn(() => ({ in: mockBookmarksIn }));
const mockBookmarksSelect = vi.fn(() => ({ eq: mockBookmarksEq }));

const mockVotesIn = vi.fn().mockResolvedValue({ data: [{ post_id: 'post-1', poll_option_id: 'opt-1' }] });
const mockVotesEq = vi.fn(() => ({ in: mockVotesIn }));
const mockVotesSelect = vi.fn(() => ({ eq: mockVotesEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'likes') return { select: mockLikesSelect };
      if (table === 'bookmarks') return { select: mockBookmarksSelect };
      if (table === 'poll_votes') return { select: mockVotesSelect };
      return { select: mockSelect };
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePosts', () => {
  it('returns poll tallies, the viewer\'s own vote, and buy & sell details', async () => {
    mockLimit.mockResolvedValue({ data: mockPostsData, error: null });

    const { result } = renderHook(
      () => usePosts({ cityId: 'city-1', channelId: null, viewerId: 'user-1' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [pollPost, buySellPost] = result.current.data!;

    expect(pollPost.poll).toEqual({
      options: [
        { id: 'opt-1', option_text: 'CnT', display_order: 0, vote_count: 3 },
        { id: 'opt-2', option_text: 'Rico\'s', display_order: 1, vote_count: 1 },
      ],
      viewer_vote_option_id: 'opt-1',
    });
    expect(pollPost.buy_sell).toBeNull();

    expect(buySellPost.poll).toBeNull();
    expect(buySellPost.buy_sell).toEqual({
      price_amount: 3500,
      price_currency: 'PHP',
      category: 'Vehicles',
    });

    expect(mockSelect).toHaveBeenCalledWith(
      'id, author_id, city_id, channel_id, post_type, body, shared_post_id, created_at, ' +
        'author:profiles!posts_author_id_fkey(username, display_name, avatar_url), ' +
        'post_media(media_url, media_type, duration_seconds), ' +
        'poll_options(id, option_text, display_order, poll_votes(count)), ' +
        'post_buy_sell(price_amount, price_currency, category), ' +
        'likes(count), comments(count)'
    );
  });
});
