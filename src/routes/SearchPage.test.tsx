import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchPage } from './SearchPage';
import { useSearchProfiles } from '../hooks/useSearchProfiles';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useSearchProfiles');

const mockUseSearchProfiles = vi.mocked(useSearchProfiles);

const mockConnectionsEq = vi.fn().mockResolvedValue({ data: [], error: null });
const mockConnectionsInsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: mockConnectionsEq }),
      insert: mockConnectionsInsert,
    }),
  },
}));

function renderPage() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SearchPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchProfiles.mockReturnValue({ data: undefined, isLoading: false } as any);
    mockConnectionsEq.mockResolvedValue({ data: [], error: null });
    mockConnectionsInsert.mockResolvedValue({ error: null });
  });

  it('shows nothing when the search box is empty', () => {
    renderPage();
    expect(screen.queryByText('No users found.')).not.toBeInTheDocument();
  });

  it('lists matching users with a link to their public profile', async () => {
    mockUseSearchProfiles.mockReturnValue({
      data: [
        { id: 'user-2', username: 'bob', display_name: 'Bob Smith', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
      ],
      isLoading: false,
    } as any);
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search'), 'bob');

    await waitFor(() => expect(screen.getByText('bob')).toBeInTheDocument());
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bob Smith/ })).toHaveAttribute('href', '/u/bob');
  });

  it('shows a Connect button per result and connects on click', async () => {
    mockUseSearchProfiles.mockReturnValue({
      data: [
        { id: 'user-2', username: 'bob', display_name: 'Bob Smith', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
      ],
      isLoading: false,
    } as any);
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search'), 'bob');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() =>
      expect(mockConnectionsInsert).toHaveBeenCalledWith({ follower_id: 'user-1', followed_id: 'user-2' })
    );
  });

  it('shows an empty state when a search has no matches', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search'), 'nobody');

    mockUseSearchProfiles.mockReturnValue({ data: [], isLoading: false } as any);
    await user.type(screen.getByPlaceholderText('Search'), 'x');

    await waitFor(() => expect(screen.getByText('No users found.')).toBeInTheDocument());
  });
});
