import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from './ProfilePage';
import { useAuth } from '../hooks/useAuth';

vi.mock('../hooks/useAuth');

const mockUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    session: { user: { id: 'user-1' } } as any,
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  });
});

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
                created_at: '2026-01-01',
              },
              error: null,
            }),
        }),
      }),
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
});
