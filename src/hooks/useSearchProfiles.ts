import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/profile';

export function useSearchProfiles(query: string, excludeUserId: string) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: ['search-profiles', trimmed],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, city_id, reputation_score, created_at')
        .ilike('username', `%${trimmed}%`)
        .neq('id', excludeUserId)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: trimmed.length > 0,
  });
}
