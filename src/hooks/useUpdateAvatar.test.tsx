import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdateAvatar } from './useUpdateAvatar';

const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example.com/${path}` } }));
const mockEq = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ update: mockUpdate }),
    storage: {
      from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }),
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function makeFile(name: string) {
  return new File(['fake'], name, { type: 'image/jpeg' });
}

describe('useUpdateAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
    mockEq.mockResolvedValue({ error: null });
  });

  it('uploads the photo with upsert, then updates the profile with a cache-busted URL', async () => {
    const { result } = renderHook(() => useUpdateAvatar(), { wrapper });

    result.current.mutate({ userId: 'user-1', file: makeFile('photo.jpg') });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUpload).toHaveBeenCalledWith('user-1/avatar.jpg', expect.any(File), { upsert: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      avatar_url: expect.stringMatching(/^https:\/\/cdn\.example\.com\/user-1\/avatar\.jpg\?t=\d+$/),
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
    expect(result.current.data).toMatch(/^https:\/\/cdn\.example\.com\/user-1\/avatar\.jpg\?t=\d+$/);
  });

  it('throws when the upload fails', async () => {
    mockUpload.mockResolvedValue({ error: new Error('upload failed') });
    const { result } = renderHook(() => useUpdateAvatar(), { wrapper });

    result.current.mutate({ userId: 'user-1', file: makeFile('photo.jpg') });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
