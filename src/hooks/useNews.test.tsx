import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNews } from './useNews';

const mockOrder = vi.fn();
const mockEq = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));

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
  it('fetches news articles for the given category, ordered by most recent first', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: 'a1',
          title: 'PI Network price nears $0.10',
          url: 'https://crypto.news/example',
          source: 'crypto.news',
          summary: 'PI climbed over 11%.',
          published_at: '2026-07-21T00:00:00Z',
          category: 'pi_network',
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useNews('pi_network'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('category', 'pi_network');
    expect(mockOrder).toHaveBeenCalledWith('published_at', { ascending: false });
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].title).toBe('PI Network price nears $0.10');
  });

  it('fetches the other category when asked', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useNews('crypto_update'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('category', 'crypto_update');
  });
});
