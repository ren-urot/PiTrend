import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreatePost } from './useCreatePost';

const mockPostInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'post-1' }, error: null });
const mockPostInsertSelect = vi.fn(() => ({ single: mockPostInsertSingle }));
const mockPostInsert = vi.fn(() => ({ select: mockPostInsertSelect }));

const mockMediaInsert = vi.fn().mockResolvedValue({ error: null });

const mockUpload = vi.fn().mockResolvedValue({ error: null });
const mockGetPublicUrl = vi.fn(() => ({ data: { publicUrl: 'https://example.com/post-media/user-1/post-1.jpg' } }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'post_media') return { insert: mockMediaInsert };
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
});
