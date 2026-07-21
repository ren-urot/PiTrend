import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateListingDialog } from './CreateListingDialog';
import { useCities } from '../../hooks/useCities';
import { useCreateListing } from '../../hooks/useCreateListing';

vi.mock('../../hooks/useCities');
vi.mock('../../hooks/useCreateListing');

const mockUseCities = vi.mocked(useCities);
const mockUseCreateListing = vi.mocked(useCreateListing);

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <CreateListingDialog
      open
      onOpenChange={onOpenChange}
      sellerId="user-1"
      defaultCityId="city-1"
    />
  );
  return { onOpenChange };
}

describe('CreateListingDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCities.mockReturnValue({
      data: [
        { id: 'city-1', name: 'Liloan', slug: 'liloan', country: 'Philippines' },
        { id: 'city-2', name: 'Talisay', slug: 'talisay', country: 'Philippines' },
      ],
    } as any);
  });

  it('submits the listing with the entered fields and resets on success', async () => {
    const mutateAsync = vi.fn().mockResolvedValue('listing-1');
    mockUseCreateListing.mockReturnValue({ mutateAsync, isPending: false } as any);
    const { onOpenChange } = renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Title'), 'Headphones');
    await user.type(screen.getByPlaceholderText('Price'), '2500');
    await user.click(screen.getByRole('button', { name: 'Post listing' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        sellerId: 'user-1',
        cityId: 'city-1',
        category: 'other',
        title: 'Headphones',
        description: null,
        priceAmount: 2500,
        priceCurrency: 'PHP',
        photoFiles: [],
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows an error message when creating the listing fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('nope'));
    mockUseCreateListing.mockReturnValue({ mutateAsync, isPending: false } as any);
    renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Title'), 'Headphones');
    await user.type(screen.getByPlaceholderText('Price'), '2500');
    await user.click(screen.getByRole('button', { name: 'Post listing' }));

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't create your listing. Please try again.")
      ).toBeInTheDocument()
    );
  });
});
