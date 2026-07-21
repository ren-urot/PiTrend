import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { MarketplaceCategory, MarketplaceListing } from '../types/marketplace';

export type MarketplaceScope = 'nearby' | 'all' | 'mine';

interface UseMarketplaceListingsParams {
  scope: MarketplaceScope;
  cityId: string | undefined;
  category: MarketplaceCategory | null;
  search: string;
  viewerId: string | undefined;
}

export function useMarketplaceListings({
  scope,
  cityId,
  category,
  search,
  viewerId,
}: UseMarketplaceListingsParams) {
  return useQuery({
    queryKey: ['marketplace-listings', scope, cityId, category, search, viewerId],
    queryFn: async (): Promise<MarketplaceListing[]> => {
      if (scope === 'nearby' && !cityId) return [];

      let query = supabase
        .from('marketplace_listings')
        .select(
          'id, city_id, category, title, description, price_amount, price_currency, status, created_at, ' +
            'seller:profiles!marketplace_listings_seller_id_fkey(id, username, display_name, avatar_url), ' +
            'city:cities!marketplace_listings_city_id_fkey(name), ' +
            'photos:marketplace_listing_photos(id, photo_url, display_order)'
        );

      if (scope === 'mine') {
        query = query.eq('seller_id', viewerId);
      } else {
        query = query.eq('status', 'active');
        if (scope === 'nearby' && cityId) {
          query = query.eq('city_id', cityId);
        }
      }

      if (category) {
        query = query.eq('category', category);
      }

      const trimmedSearch = search.trim();
      if (trimmedSearch) {
        query = query.or(`title.ilike.%${trimmedSearch}%,description.ilike.%${trimmedSearch}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.id,
        seller: row.seller,
        city_id: row.city_id,
        city_name: row.city?.name ?? '',
        category: row.category,
        title: row.title,
        description: row.description,
        price_amount: row.price_amount,
        price_currency: row.price_currency,
        status: row.status,
        created_at: row.created_at,
        photos: [...(row.photos ?? [])].sort(
          (a: any, b: any) => a.display_order - b.display_order
        ),
      }));
    },
  });
}
