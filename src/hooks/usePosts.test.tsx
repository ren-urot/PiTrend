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
    post_type: 'repost',
    body: null,
    shared_post_id: 'post-original',
    created_at: '2026-01-03T00:00:00Z',
    author: { username: 'renz', display_name: 'Ren', avatar_url: null },
    post_media: null,
    poll_options: [],
    post_buy_sell: null,
    shared_post: {
      id: 'post-original',
      post_type: 'text',
      body: 'The original post',
      author: { username: 'other', display_name: 'Other', avatar_url: null },
      post_media: null,
    },
    likes: [{ count: 0 }],
    comments: [{ count: 0 }],
  },
  {
    id: 'post-2',
    author_id: 'user-2',
    city_id: 'city-1',
    channel_id: null,
    post_type: 'repost',
    body: null,
    shared_post_id: 'post-deleted',
    created_at: '2026-01-04T00:00:00Z',
    author: { username: 'other2', display_name: 'Other Two', avatar_url: null },
    post_media: null,
    poll_options: [],
    post_buy_sell: null,
    shared_post: null,
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

const mockVotesIn = vi.fn().mockResolvedValue({ data: [] });
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
  it('returns the shared-post preview for a repost, or null if the original is gone', async () => {
    mockLimit.mockResolvedValue({ data: mockPostsData, error: null });

    const { result } = renderHook(
      () => usePosts({ cityId: 'city-1', channelId: null, viewerId: undefined }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [repostWithOriginal, repostWithDeletedOriginal] = result.current.data!;

    expect(repostWithOriginal.shared_post).toEqual({
      id: 'post-original',
      post_type: 'text',
      body: 'The original post',
      author: { username: 'other', display_name: 'Other', avatar_url: null },
      post_media: null,
    });
    expect(repostWithDeletedOriginal.shared_post).toBeNull();

    expect(mockSelect).toHaveBeenCalledWith(
      'id, author_id, city_id, channel_id, post_type, body, shared_post_id, created_at, ' +
        'author:profiles!posts_author_id_fkey(username, display_name, avatar_url), ' +
        'post_media(media_url, media_type, duration_seconds), ' +
        'poll_options(id, option_text, display_order, poll_votes(count)), ' +
        'post_buy_sell(price_amount, price_currency, category), ' +
        'shared_post:posts!shared_post_id(id, post_type, body, ' +
        'author:profiles!posts_author_id_fkey(username, display_name, avatar_url), ' +
        'post_media(media_url, media_type, duration_seconds)), ' +
        'likes(count), comments(count)'
    );
  });
});
