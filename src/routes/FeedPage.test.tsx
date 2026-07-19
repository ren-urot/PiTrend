import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeedPage } from './FeedPage';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useProfile', () => ({
  useProfile: () => ({
    data: {
      id: 'user-1',
      username: 'renz',
      display_name: 'Ren',
      avatar_url: null,
      city_id: 'city-1',
      reputation_score: 0,
      created_at: '2026-01-01',
    },
    isLoading: false,
  }),
}));

vi.mock('../hooks/useCities', () => ({
  useCities: () => ({
    data: [{ id: 'city-1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines' }],
    isLoading: false,
  }),
}));

describe('FeedPage', () => {
  it('shows the coming-soon message scoped to the user\'s city', () => {
    render(<FeedPage />);
    expect(screen.getByText('Cebu City Feed — coming soon.')).toBeInTheDocument();
  });
});
