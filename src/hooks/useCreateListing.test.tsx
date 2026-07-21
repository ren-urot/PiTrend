import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateListing } from './useCreateListing';

const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockListingInsert = vi.fn(() => ({ select: mockSelect }));
const mockPhotoInsert = vi.fn();

const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example.com/${path}` } }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'marketplace_listings') return { insert: mockListingInsert };
      return { insert: mockPhotoInsert };
    },
    storage: {
      from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }),
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function makeFile(name: string) {
  return new File(['fake'], name, { type: 'image/jpeg' });
}

describe('useCreateListing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { id: 'listing-1' }, error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockPhotoInsert.mockResolvedValue({ error: null });
  });

  it('inserts the listing and uploads each photo in order', async () => {
    const { result } = renderHook(() => useCreateListing(), { wrapper });

    result.current.mutate({
      sellerId: 'user-1',
      cityId: 'city-1',
      category: 'electronics',
      title: 'Noise-cancelling headphones',
      description: 'Barely used',
      priceAmount: 2500,
      priceCurrency: 'PHP',
      photoFiles: [makeFile('a.jpg'), makeFile('b.jpg')],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockListingInsert).toHaveBeenCalledWith({
      seller_id: 'user-1',
      city_id: 'city-1',
      category: 'electronics',
      title: 'Noise-cancelling headphones',
      description: 'Barely used',
      price_amount: 2500,
      price_currency: 'PHP',
    });
    expect(mockUpload).toHaveBeenCalledWith('user-1/listing-1/0.jpg', expect.any(File));
    expect(mockUpload).toHaveBeenCalledWith('user-1/listing-1/1.jpg', expect.any(File));
    expect(mockPhotoInsert).toHaveBeenCalledWith({
      listing_id: 'listing-1',
      photo_url: 'https://cdn.example.com/user-1/listing-1/0.jpg',
      display_order: 0,
    });
    expect(mockPhotoInsert).toHaveBeenCalledWith({
      listing_id: 'listing-1',
      photo_url: 'https://cdn.example.com/user-1/listing-1/1.jpg',
      display_order: 1,
    });
    expect(result.current.data).toBe('listing-1');
  });

  it('creates a listing with no photos without touching storage', async () => {
    const { result } = renderHook(() => useCreateListing(), { wrapper });

    result.current.mutate({
      sellerId: 'user-1',
      cityId: 'city-1',
      category: 'other',
      title: 'Free stuff',
      description: null,
      priceAmount: 0,
      priceCurrency: 'PHP',
      photoFiles: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
