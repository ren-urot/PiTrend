import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreatePost } from './useCreatePost';

const mockPostInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'post-1' }, error: null });
const mockPostInsertSelect = vi.fn(() => ({ single: mockPostInsertSingle }));
const mockPostInsert = vi.fn(() => ({ select: mockPostInsertSelect }));

const mockMediaInsert = vi.fn().mockResolvedValue({ error: null });
const mockPollInsert = vi.fn().mockResolvedValue({ error: null });
const mockPollOptionsInsert = vi.fn().mockResolvedValue({ error: null });
const mockBuySellInsert = vi.fn().mockResolvedValue({ error: null });

const mockUpload = vi.fn().mockResolvedValue({ error: null });
const mockGetPublicUrl = vi.fn(() => ({ data: { publicUrl: 'https://example.com/post-media/user-1/post-1.jpg' } }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'post_media') return { insert: mockMediaInsert };
      if (table === 'post_polls') return { insert: mockPollInsert };
      if (table === 'poll_options') return { insert: mockPollOptionsInsert };
      if (table === 'post_buy_sell') return { insert: mockBuySellInsert };
      return { insert: mockPostInsert };
    },
    storage: {
      from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }),
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCreatePost', () => {
  it('inserts a text post with no media upload', async () => {
    const { result } = renderHook(() => useCreatePost(), { wrapper });

    result.current.mutate({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'text',
      body: 'Hello',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPostInsert).toHaveBeenCalledWith({
      author_id: 'user-1',
      city_id: 'city-1',
      channel_id: null,
      post_type: 'text',
      body: 'Hello',
    });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockMediaInsert).not.toHaveBeenCalled();
  });

  it('uploads media and inserts post_media for a photo post', async () => {
    const { result } = renderHook(() => useCreatePost(), { wrapper });
    const file = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });

    result.current.mutate({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'photo',
      body: null,
      mediaFile: file,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUpload).toHaveBeenCalledWith('user-1/post-1.jpg', file);
    expect(mockMediaInsert).toHaveBeenCalledWith({
      post_id: 'post-1',
      media_url: 'https://example.com/post-media/user-1/post-1.jpg',
      media_type: 'photo',
    });
  });

  it('inserts post_polls and poll_options for a poll post', async () => {
    const { result } = renderHook(() => useCreatePost(), { wrapper });

    result.current.mutate({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'poll',
      body: 'Best lechon in town?',
      pollOptions: ['CnT', "Rico's"],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPollInsert).toHaveBeenCalledWith({ post_id: 'post-1' });
    expect(mockPollOptionsInsert).toHaveBeenCalledWith([
      { post_id: 'post-1', option_text: 'CnT', display_order: 0 },
      { post_id: 'post-1', option_text: "Rico's", display_order: 1 },
    ]);
  });

  it('inserts post_buy_sell for a buy & sell post', async () => {
    const { result } = renderHook(() => useCreatePost(), { wrapper });

    result.current.mutate({
      authorId: 'user-1',
      cityId: 'city-1',
      channelId: null,
      postType: 'buy_sell',
      body: 'Selling my bike',
      buySell: { priceAmount: 3500, priceCurrency: 'PHP', category: 'Vehicles' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockBuySellInsert).toHaveBeenCalledWith({
      post_id: 'post-1',
      price_amount: 3500,
      price_currency: 'PHP',
      category: 'Vehicles',
    });
  });
});
