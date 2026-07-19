import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../hooks/useAuth';
import { routes } from './routes';

let currentSession: { user: { id: string } } | null = null;
let currentProfile: {
  id: string;
  username: string;
  display_name: string;
  avatar_url: null;
  city_id: string;
  reputation_score: number;
  created_at: string;
} | null = null;

const mockCities = [{ id: 'city-1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines' }];

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: currentSession } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn(),
    },
    from: (table: string) => {
      if (table === 'cities') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: mockCities, error: null }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: currentProfile, error: null }),
          }),
        }),
        insert: (row: { id: string; username: string; display_name: string; city_id: string }) => {
          currentProfile = { ...row, avatar_url: null, reputation_score: 0, created_at: '2026-01-01' };
          return Promise.resolve({ error: null });
        },
      };
    },
  },
}));

function renderApp() {
  const queryClient = new QueryClient();
  const router = createMemoryRouter(routes, { initialEntries: ['/feed'] });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('app routing', () => {
  beforeEach(() => {
    currentSession = null;
    currentProfile = null;
  });

  it('routes an unauthenticated user to login', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('PiMesh')).toBeInTheDocument());
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  });

  it('routes an authenticated user without a profile to username setup, then to the shell', async () => {
    currentSession = { user: { id: 'user-1' } };
    renderApp();

    await waitFor(() => expect(screen.getByText('Choose a username')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Cebu City' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByText('Cebu City Feed — coming soon.')).toBeInTheDocument());
  });
});
