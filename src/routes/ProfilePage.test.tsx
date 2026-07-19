import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from './ProfilePage';
import { useAuth } from '../hooks/useAuth';

vi.mock('../hooks/useAuth');

const mockUseAuth = vi.mocked(useAuth);

const mockEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockEq }));

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    session: { user: { id: 'user-1' } } as any,
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  });
  mockEq.mockClear();
  mockUpdate.mockClear();
});

vi.mock('../hooks/useCities', () => ({
  useCities: () => ({
    data: [
      { id: 'city-1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines' },
      { id: 'city-2', name: 'Manila', slug: 'manila', country: 'Philippines' },
    ],
    isLoading: false,
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: {
                id: 'user-1',
                username: 'renz',
                display_name: 'Ren',
                avatar_url: null,
                city_id: 'city-1',
                reputation_score: 0,
                created_at: '2026-01-01',
              },
              error: null,
            }),
        }),
      }),
      update: mockUpdate,
    }),
  },
}));

function renderPage() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ProfilePage />
    </QueryClientProvider>
  );
}

describe('ProfilePage', () => {
  it('renders the current user profile and a QR code', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());
    expect(screen.getByText('@renz')).toBeInTheDocument();
  });

  it('shows a loading state while auth is still resolving, not an error', () => {
    mockUseAuth.mockReturnValue({
      session: null as any,
      loading: true,
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Loading profile…')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your profile.")).not.toBeInTheDocument();
  });

  it('shows the current city and updates it when a new one is chosen', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Cebu City')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Manila' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ city_id: 'city-2' })
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('shows an error message and leaves the city unchanged when the update fails', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'network error' } });
    renderPage();
    await waitFor(() => expect(screen.getByText('Cebu City')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Manila' }));

    await waitFor(() =>
      expect(screen.getByText("Couldn't update your city. Please try again.")).toBeInTheDocument()
    );
    expect(screen.getByText('Cebu City')).toBeInTheDocument();
  });
});
