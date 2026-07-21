import { describe, it, expect } from 'vitest';
import { groupCitiesByIslandGroup, ISLAND_GROUP_LABELS } from './cityDisplay';
import type { City } from '../types/city';

const manila: City = { id: '1', name: 'Manila', slug: 'manila', country: 'Philippines', island_group: 'luzon' };
const cebu: City = { id: '2', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines', island_group: 'visayas' };
const talisay: City = { id: '3', name: 'Talisay', slug: 'talisay', country: 'Philippines', island_group: 'visayas' };
const davao: City = { id: '4', name: 'Davao', slug: 'davao', country: 'Philippines', island_group: 'mindanao' };

describe('groupCitiesByIslandGroup', () => {
  it('groups cities under Luzon, Visayas, then Mindanao, in that order', () => {
    const groups = groupCitiesByIslandGroup([davao, talisay, manila, cebu]);
    expect(groups.map((entry) => entry.group)).toEqual(['luzon', 'visayas', 'mindanao']);
    expect(groups[0].cities).toEqual([manila]);
    expect(groups[1].cities).toEqual([talisay, cebu]);
    expect(groups[2].cities).toEqual([davao]);
  });

  it('omits an island group with no cities', () => {
    const groups = groupCitiesByIslandGroup([manila]);
    expect(groups.map((entry) => entry.group)).toEqual(['luzon']);
  });
});

describe('ISLAND_GROUP_LABELS', () => {
  it('has a human-readable label for every island group', () => {
    expect(ISLAND_GROUP_LABELS.luzon).toBe('Luzon');
    expect(ISLAND_GROUP_LABELS.visayas).toBe('Visayas');
    expect(ISLAND_GROUP_LABELS.mindanao).toBe('Mindanao');
  });
});
