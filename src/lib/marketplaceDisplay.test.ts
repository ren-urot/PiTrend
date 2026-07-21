import { describe, it, expect } from 'vitest';
import { formatListingPrice, MARKETPLACE_CATEGORY_LABELS } from './marketplaceDisplay';

describe('formatListingPrice', () => {
  it('formats PHP with a peso sign and thousands separators', () => {
    expect(formatListingPrice(2500, 'PHP')).toBe('₱2,500');
  });

  it('formats USD with a dollar sign', () => {
    expect(formatListingPrice(99, 'USD')).toBe('$99');
  });

  it('formats PI with a pi sign', () => {
    expect(formatListingPrice(10, 'PI')).toBe('π10');
  });
});

describe('MARKETPLACE_CATEGORY_LABELS', () => {
  it('has a human-readable label for every category', () => {
    expect(MARKETPLACE_CATEGORY_LABELS.electronics).toBe('Electronics');
    expect(MARKETPLACE_CATEGORY_LABELS.vehicles).toBe('Vehicles');
    expect(MARKETPLACE_CATEGORY_LABELS.property).toBe('Property & Rentals');
    expect(MARKETPLACE_CATEGORY_LABELS.home_furniture).toBe('Home & Furniture');
    expect(MARKETPLACE_CATEGORY_LABELS.jobs).toBe('Jobs');
    expect(MARKETPLACE_CATEGORY_LABELS.other).toBe('Other');
  });
});
