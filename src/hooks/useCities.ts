import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { City } from '../types/city';

export function useCities() {
  return useQuery({
    queryKey: ['cities'],
    queryFn: async (): Promise<City[]> => {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, slug, country, island_group')
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });
}
