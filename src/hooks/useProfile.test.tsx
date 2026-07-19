import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useProfile } from './useProfile';

const mockMaybeSingle = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProfile', () => {
  it('returns profile data on success', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'u1',
        username: 'renz',
        display_name: 'Ren',
        avatar_url: null,
        created_at: '2026-01-01',
      },
      error: null,
    });

    const { result } = renderHook(() => useProfile('u1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.username).toBe('renz');
  });
});
