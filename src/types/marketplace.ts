export type MarketplaceCategory =
  | 'electronics'
  | 'vehicles'
  | 'property'
  | 'home_furniture'
  | 'jobs'
  | 'other';

export type MarketplaceListingStatus = 'active' | 'sold';

export interface MarketplaceSeller {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface MarketplaceListingPhoto {
  id: string;
  photo_url: string;
  display_order: number;
}

export interface MarketplaceListing {
  id: string;
  seller: MarketplaceSeller;
  city_id: string;
  city_name: string;
  category: MarketplaceCategory;
  title: string;
  description: string | null;
  price_amount: number;
  price_currency: 'USD' | 'PHP' | 'PI';
  status: MarketplaceListingStatus;
  created_at: string;
  photos: MarketplaceListingPhoto[];
}
