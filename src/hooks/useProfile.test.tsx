import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useProfile } from './useProfile';

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
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

describe('useProfile', () => {
  it('returns profile data on success, including city_id and reputation_score', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'u1',
        username: 'renz',
        display_name: 'Ren',
        avatar_url: null,
        city_id: 'city-1',
        reputation_score: 0,
        created_at: '2026-01-01',
      },
      error: null,
    });

    const { result } = renderHook(() => useProfile('u1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.username).toBe('renz');
    expect(result.current.data?.city_id).toBe('city-1');
    expect(result.current.data?.reputation_score).toBe(0);
    expect(mockSelect).toHaveBeenCalledWith(
      'id, username, display_name, avatar_url, city_id, reputation_score, created_at'
    );
  });
});
