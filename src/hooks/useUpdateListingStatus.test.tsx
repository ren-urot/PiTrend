import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdateListingStatus } from './useUpdateListingStatus';

const mockEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ update: mockUpdate }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useUpdateListingStatus', () => {
  it('updates the listing status by id', async () => {
    const { result } = renderHook(() => useUpdateListingStatus(), { wrapper });

    result.current.mutate({ listingId: 'listing-1', status: 'sold' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'sold' });
    expect(mockEq).toHaveBeenCalledWith('id', 'listing-1');
  });
});
