import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeedPage } from './FeedPage';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useProfile');
vi.mock('../hooks/useCities');

const mockUseProfile = vi.mocked(useProfile);
const mockUseCities = vi.mocked(useCities);

beforeEach(() => {
  mockUseProfile.mockReturnValue({
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
  } as any);

  mockUseCities.mockReturnValue({
    data: [{ id: 'city-1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines' }],
    isLoading: false,
  } as any);
});

describe('FeedPage', () => {
  it('shows the coming-soon message scoped to the user\'s city', () => {
    render(<FeedPage />);
    expect(screen.getByText('Cebu City Feed — coming soon.')).toBeInTheDocument();
  });

  it('falls back to the generic message while the profile or cities are still loading', () => {
    mockUseProfile.mockReturnValue({ data: undefined, isLoading: true } as any);
    mockUseCities.mockReturnValue({ data: undefined, isLoading: true } as any);

    render(<FeedPage />);

    expect(screen.getByText('Feed — coming soon.')).toBeInTheDocument();
  });
});
