import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Channel } from '../types/channel';

export function useChannels() {
  return useQuery({
    queryKey: ['channels'],
    queryFn: async (): Promise<Channel[]> => {
      const { data, error } = await supabase
        .from('channels')
        .select('id, name, slug, city_id, description')
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });
}
