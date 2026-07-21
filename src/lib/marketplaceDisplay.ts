import type { MarketplaceCategory } from '../types/marketplace';

const CURRENCY_SYMBOLS: Record<'USD' | 'PHP' | 'PI', string> = {
  USD: '$',
  PHP: '₱',
  PI: 'π',
};

export function formatListingPrice(amount: number, currency: 'USD' | 'PHP' | 'PI'): string {
  return `${CURRENCY_SYMBOLS[currency]}${amount.toLocaleString()}`;
}

export const MARKETPLACE_CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  electronics: 'Electronics',
  vehicles: 'Vehicles',
  property: 'Property & Rentals',
  home_furniture: 'Home & Furniture',
  jobs: 'Jobs',
  other: 'Other',
};
