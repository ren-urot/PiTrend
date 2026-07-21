import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUserPosts } from './useUserPosts';

const mockPostsData = [
  {
    id: 'post-1',
    author_id: 'user-1',
    city_id: 'city-1',
    channel_id: null,
    post_type: 'text',
    body: 'Hello from Ren',
    shared_post_id: null,
    created_at: '2026-01-03T00:00:00Z',
    author: { username: 'renz', display_name: 'Ren', avatar_url: null },
    post_media: null,
    poll_options: [],
    post_buy_sell: null,
    shared_post: null,
    likes: [{ count: 2 }],
    comments: [{ count: 0 }],
  },
];

const mockLimit = vi.fn();
const mockOrder = vi.fn(() => ({ limit: mockLimit }));
const mockEqAuthor = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEqAuthor }));

const mockLikesIn = vi.fn().mockResolvedValue({ data: [] });
const mockLikesEq = vi.fn(() => ({ in: mockLikesIn }));
const mockLikesSelect = vi.fn(() => ({ eq: mockLikesEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'likes') return { select: mockLikesSelect };
      if (table === 'bookmarks') return { select: () => ({ eq: () => ({ in: vi.fn().mockResolvedValue({ data: [] }) }) }) };
      if (table === 'poll_votes') return { select: () => ({ eq: () => ({ in: vi.fn().mockResolvedValue({ data: [] }) }) }) };
      return { select: mockSelect };
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useUserPosts', () => {
  it("fetches a user's posts ordered newest first", async () => {
    mockLimit.mockResolvedValue({ data: mockPostsData, error: null });

    const { result } = renderHook(() => useUserPosts({ authorId: 'user-1', viewerId: undefined }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].body).toBe('Hello from Ren');
    expect(result.current.data![0].like_count).toBe(2);
    expect(mockEqAuthor).toHaveBeenCalledWith('author_id', 'user-1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns an empty list without querying when there is no authorId', async () => {
    const { result } = renderHook(() => useUserPosts({ authorId: undefined, viewerId: undefined }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
