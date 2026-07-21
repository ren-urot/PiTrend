import type { City, IslandGroup } from '../types/city';

export const ISLAND_GROUP_LABELS: Record<IslandGroup, string> = {
  luzon: 'Luzon',
  visayas: 'Visayas',
  mindanao: 'Mindanao',
};

const ISLAND_GROUP_ORDER: IslandGroup[] = ['luzon', 'visayas', 'mindanao'];

export function groupCitiesByIslandGroup(cities: City[]): { group: IslandGroup; cities: City[] }[] {
  return ISLAND_GROUP_ORDER.map((group) => ({
    group,
    cities: cities.filter((city) => city.island_group === group),
  })).filter((entry) => entry.cities.length > 0);
}
