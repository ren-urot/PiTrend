export type IslandGroup = 'luzon' | 'visayas' | 'mindanao';

export interface City {
  id: string;
  name: string;
  slug: string;
  country: string;
  island_group: IslandGroup;
}
