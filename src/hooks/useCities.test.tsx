import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCities } from './useCities';

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

describe('useCities', () => {
  it('returns cities ordered by name', async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: 'c1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines', island_group: 'visayas' },
        { id: 'c2', name: 'Manila', slug: 'manila', country: 'Philippines', island_group: 'luzon' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useCities(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(mockSelect).toHaveBeenCalledWith('id, name, slug, country, island_group');
    expect(mockOrder).toHaveBeenCalledWith('name', { ascending: true });
  });
});
