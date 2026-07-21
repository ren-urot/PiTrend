import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MarketplaceListingCard } from './MarketplaceListingCard';
import { useCreateConversation } from '../../hooks/useCreateConversation';
import { useUpdateListingStatus } from '../../hooks/useUpdateListingStatus';
import { useDeleteListing } from '../../hooks/useDeleteListing';
import type { MarketplaceListing } from '../../types/marketplace';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../hooks/useCreateConversation');
vi.mock('../../hooks/useUpdateListingStatus');
vi.mock('../../hooks/useDeleteListing');

const mockUseCreateConversation = vi.mocked(useCreateConversation);
const mockUseUpdateListingStatus = vi.mocked(useUpdateListingStatus);
const mockUseDeleteListing = vi.mocked(useDeleteListing);

const mockMutateAsync = vi.fn().mockResolvedValue('conversation-1');
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

const listing: MarketplaceListing = {
  id: 'listing-1',
  seller: { id: 'seller-1', username: 'renz', display_name: 'Ren', avatar_url: null },
  city_id: 'city-1',
  city_name: 'Liloan',
  category: 'electronics',
  title: 'Noise-cancelling headphones',
  description: 'Barely used, great condition.',
  price_amount: 2500,
  price_currency: 'PHP',
  status: 'active',
  created_at: '2026-07-01T00:00:00Z',
  photos: [
    { id: 'photo-1', photo_url: 'https://example.com/1.jpg', display_order: 0 },
    { id: 'photo-2', photo_url: 'https://example.com/2.jpg', display_order: 1 },
  ],
};

function renderCard(overrides: {
  listing?: MarketplaceListing;
  viewerId?: string | undefined;
  expanded?: boolean;
} = {}) {
  const onToggleExpand = vi.fn();
  render(
    <MemoryRouter>
      <MarketplaceListingCard
        listing={overrides.listing ?? listing}
        viewerId={overrides.viewerId ?? 'buyer-1'}
        expanded={overrides.expanded ?? false}
        onToggleExpand={onToggleExpand}
      />
    </MemoryRouter>
  );
  return { onToggleExpand };
}

describe('MarketplaceListingCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateConversation.mockReturnValue({ mutateAsync: mockMutateAsync } as any);
    mockUseUpdateListingStatus.mockReturnValue({ mutate: mockUpdateMutate } as any);
    mockUseDeleteListing.mockReturnValue({ mutate: mockDeleteMutate } as any);
  });

  it('shows the cover photo, title, formatted price, and city when collapsed', () => {
    renderCard();
    expect(screen.getByText('Noise-cancelling headphones')).toBeInTheDocument();
    expect(screen.getByText('₱2,500')).toBeInTheDocument();
    expect(screen.getByText('Liloan')).toBeInTheDocument();
    expect(screen.queryByText('Barely used, great condition.')).not.toBeInTheDocument();
  });

  it('calls onToggleExpand when the card is clicked', async () => {
    const { onToggleExpand } = renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Noise-cancelling headphones/ }));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('shows the description and a Message Seller button when expanded for another seller', async () => {
    renderCard({ expanded: true });
    expect(screen.getByText('Barely used, great condition.')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Message Seller/ }));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      creatorId: 'buyer-1',
      participantIds: ['seller-1'],
      isGroup: false,
    });
    expect(mockNavigate).toHaveBeenCalledWith('/messages/conversation-1');
  });

  it('shows Sold/Active and Delete controls, not Message Seller, when expanded for the listing owner', async () => {
    renderCard({ expanded: true, viewerId: 'seller-1' });
    expect(screen.queryByRole('button', { name: /Message Seller/ })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mark as Sold' }));
    expect(mockUpdateMutate).toHaveBeenCalledWith({ listingId: 'listing-1', status: 'sold' });

    await user.click(screen.getByRole('button', { name: /Delete/ }));
    expect(mockDeleteMutate).toHaveBeenCalledWith('listing-1');
  });

  it('shows a Sold badge when the listing is sold', () => {
    renderCard({ listing: { ...listing, status: 'sold' } });
    expect(screen.getByText('Sold')).toBeInTheDocument();
  });
});
