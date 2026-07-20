import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNews } from './useNews';

const mockOrder = vi.fn();
const mockSelect = vi.fn(() => ({ order: mockOrder }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useNews', () => {
  it('fetches news articles ordered by most recent first', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: 'a1',
          title: 'PI Network price nears $0.10',
          url: 'https://crypto.news/example',
          source: 'crypto.news',
          summary: 'PI climbed over 11%.',
          published_at: '2026-07-21T00:00:00Z',
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useNews(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockOrder).toHaveBeenCalledWith('published_at', { ascending: false });
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].title).toBe('PI Network price nears $0.10');
  });
});
