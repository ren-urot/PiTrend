import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMarketplaceListings } from './useMarketplaceListings';

const mockRow = {
  id: 'listing-1',
  city_id: 'city-1',
  category: 'electronics',
  title: 'Noise-cancelling headphones',
  description: 'Barely used',
  price_amount: 2500,
  price_currency: 'PHP',
  status: 'active',
  created_at: '2026-07-01T00:00:00Z',
  seller: { id: 'user-1', username: 'renz', display_name: 'Ren', avatar_url: null },
  city: { name: 'Liloan' },
  photos: [
    { id: 'photo-2', photo_url: 'https://example.com/2.jpg', display_order: 1 },
    { id: 'photo-1', photo_url: 'https://example.com/1.jpg', display_order: 0 },
  ],
};

function makeBuilder(result: { data: unknown; error: unknown }) {
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.or = vi.fn(() => builder);
  builder.order = vi.fn().mockResolvedValue(result);
  return builder;
}

let builder = makeBuilder({ data: [mockRow], error: null });
const mockFrom = vi.fn((..._args: unknown[]) => builder);

vi.mock('../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMarketplaceListings', () => {
  it('fetches active nearby listings with photos sorted by display_order', async () => {
    builder = makeBuilder({ data: [mockRow], error: null });
    mockFrom.mockImplementation(() => builder);

    const { result } = renderHook(
      () =>
        useMarketplaceListings({
          scope: 'nearby',
          cityId: 'city-1',
          category: null,
          search: '',
          viewerId: 'user-1',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].city_name).toBe('Liloan');
    expect(result.current.data![0].photos.map((photo) => photo.id)).toEqual(['photo-1', 'photo-2']);
    expect(builder.eq).toHaveBeenCalledWith('status', 'active');
    expect(builder.eq).toHaveBeenCalledWith('city_id', 'city-1');
  });

  it('filters by seller when scope is mine, without a status filter', async () => {
    builder = makeBuilder({ data: [mockRow], error: null });
    mockFrom.mockImplementation(() => builder);

    const { result } = renderHook(
      () =>
        useMarketplaceListings({
          scope: 'mine',
          cityId: undefined,
          category: null,
          search: '',
          viewerId: 'user-1',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith('seller_id', 'user-1');
    expect(builder.eq).not.toHaveBeenCalledWith('status', 'active');
  });

  it('applies a category filter and a text search across title and description', async () => {
    builder = makeBuilder({ data: [], error: null });
    mockFrom.mockImplementation(() => builder);

    const { result } = renderHook(
      () =>
        useMarketplaceListings({
          scope: 'all',
          cityId: undefined,
          category: 'electronics',
          search: 'headphones',
          viewerId: 'user-1',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith('category', 'electronics');
    expect(builder.or).toHaveBeenCalledWith(
      'title.ilike.%headphones%,description.ilike.%headphones%'
    );
  });

  it('returns an empty list without querying when scope is nearby and no cityId is known yet', async () => {
    builder = makeBuilder({ data: [mockRow], error: null });
    mockFrom.mockImplementation(() => builder);

    const { result } = renderHook(
      () =>
        useMarketplaceListings({
          scope: 'nearby',
          cityId: undefined,
          category: null,
          search: '',
          viewerId: 'user-1',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
