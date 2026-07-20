import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSearchProfiles } from './useSearchProfiles';

const mockLimit = vi.fn();
const mockNeq = vi.fn(() => ({ limit: mockLimit }));
const mockIlike = vi.fn(() => ({ neq: mockNeq }));
const mockSelect = vi.fn(() => ({ ilike: mockIlike }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSearchProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue({
      data: [
        { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
      ],
      error: null,
    });
  });

  it('searches by username fragment, excluding the current user, capped at 10', async () => {
    const { result } = renderHook(() => useSearchProfiles('bo', 'user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockIlike).toHaveBeenCalledWith('username', '%bo%');
    expect(mockNeq).toHaveBeenCalledWith('id', 'user-1');
    expect(mockLimit).toHaveBeenCalledWith(10);
    expect(result.current.data).toHaveLength(1);
  });

  it('does not query when the search string is empty or whitespace-only', () => {
    const { result } = renderHook(() => useSearchProfiles('   ', 'user-1'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
