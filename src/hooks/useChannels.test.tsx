import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useChannels } from './useChannels';

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

describe('useChannels', () => {
  it('returns channels ordered by name', async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: 'ch-1', name: 'Pi Official', slug: 'pi-official', city_id: null, description: null },
        { id: 'ch-2', name: 'Cebu Community', slug: 'cebu-community', city_id: 'city-1', description: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useChannels(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(mockSelect).toHaveBeenCalledWith('id, name, slug, city_id, description');
    expect(mockOrder).toHaveBeenCalledWith('name', { ascending: true });
  });
});
