import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDeleteListing } from './useDeleteListing';

const mockEq = vi.fn().mockResolvedValue({ error: null });
const mockDelete = vi.fn(() => ({ eq: mockEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ delete: mockDelete }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useDeleteListing', () => {
  it('deletes the listing by id', async () => {
    const { result } = renderHook(() => useDeleteListing(), { wrapper });

    result.current.mutate('listing-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', 'listing-1');
  });
});
