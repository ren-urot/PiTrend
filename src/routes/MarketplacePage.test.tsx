import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MarketplacePage } from './MarketplacePage';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { useMarketplaceListings } from '../hooks/useMarketplaceListings';
import { useCreateConversation } from '../hooks/useCreateConversation';
import { useUpdateListingStatus } from '../hooks/useUpdateListingStatus';
import { useDeleteListing } from '../hooks/useDeleteListing';
import { useCreateListing } from '../hooks/useCreateListing';

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
vi.mock('../hooks/useMarketplaceListings');
vi.mock('../hooks/useCreateConversation');
vi.mock('../hooks/useUpdateListingStatus');
vi.mock('../hooks/useDeleteListing');
vi.mock('../hooks/useCreateListing');

const mockUseProfile = vi.mocked(useProfile);
const mockUseCities = vi.mocked(useCities);
const mockUseMarketplaceListings = vi.mocked(useMarketplaceListings);
const mockUseCreateConversation = vi.mocked(useCreateConversation);
const mockUseUpdateListingStatus = vi.mocked(useUpdateListingStatus);
const mockUseDeleteListing = vi.mocked(useDeleteListing);
const mockUseCreateListing = vi.mocked(useCreateListing);

const listing = {
  id: 'listing-1',
  seller: { id: 'seller-1', username: 'renz', display_name: 'Ren', avatar_url: null },
  city_id: 'city-1',
  city_name: 'Liloan',
  category: 'electronics' as const,
  title: 'Noise-cancelling headphones',
  description: 'Barely used',
  price_amount: 2500,
  price_currency: 'PHP' as const,
  status: 'active' as const,
  created_at: '2026-07-01T00:00:00Z',
  photos: [{ id: 'photo-1', photo_url: 'https://example.com/1.jpg', display_order: 0 }],
};

function renderPage() {
  render(
    <MemoryRouter>
      <MarketplacePage />
    </MemoryRouter>
  );
}

describe('MarketplacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    } as any);
    mockUseCities.mockReturnValue({
      data: [{ id: 'city-1', name: 'Liloan', slug: 'liloan', country: 'Philippines' }],
    } as any);
    mockUseMarketplaceListings.mockReturnValue({ data: [listing], isLoading: false } as any);
    mockUseCreateConversation.mockReturnValue({ mutateAsync: vi.fn() } as any);
    mockUseUpdateListingStatus.mockReturnValue({ mutate: vi.fn() } as any);
    mockUseDeleteListing.mockReturnValue({ mutate: vi.fn() } as any);
    mockUseCreateListing.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
  });

  it('defaults to the Nearby scope, scoped to the viewer city, and lists matching listings', () => {
    renderPage();
    expect(mockUseMarketplaceListings).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'nearby', cityId: 'city-1' })
    );
    expect(screen.getByText('Noise-cancelling headphones')).toBeInTheDocument();
  });

  it('switches scope when the Mine pill is clicked', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mine' }));
    expect(mockUseMarketplaceListings).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'mine' })
    );
  });

  it('updates the search filter as the user types', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search Marketplace'), 'phone');
    expect(mockUseMarketplaceListings).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'phone' })
    );
  });

  it('filters by category from the Categories dropdown', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Categories/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Electronics' }));
    expect(mockUseMarketplaceListings).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'electronics' })
    );
  });

  it('opens the Sell dialog when Sell is clicked', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Sell/ }));
    expect(screen.getByText('Sell something')).toBeInTheDocument();
  });

  it('shows an empty state when there are no listings', () => {
    mockUseMarketplaceListings.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText('No listings yet.')).toBeInTheDocument();
  });
});
