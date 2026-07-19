import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicProfilePage } from './PublicProfilePage';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: {
                id: 'user-1',
                username: 'renz',
                display_name: 'Ren',
                avatar_url: null,
                created_at: '2026-01-01',
              },
              error: null,
            }),
        }),
      }),
    })),
  },
}));

function renderAt(path: string) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/u/:username" element={<PublicProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PublicProfilePage', () => {
  it('renders a profile by username with no auth required', async () => {
    renderAt('/u/renz');
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());
    expect(screen.getByText('@renz')).toBeInTheDocument();
  });

  it('shows a not-found message when no profile matches the username', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    } as never);

    renderAt('/u/nobody');
    await waitFor(() => expect(screen.getByText('No profile found for @nobody.')).toBeInTheDocument());
  });
});
