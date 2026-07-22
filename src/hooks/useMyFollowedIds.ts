import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useMyFollowedIds(viewerId: string | undefined) {
  return useQuery({
    queryKey: ['my-followed-ids', viewerId],
    queryFn: async (): Promise<Set<string>> => {
      if (!viewerId) return new Set();

      const { data, error } = await supabase.from('connections').select('followed_id').eq('follower_id', viewerId);
      if (error) throw error;

      return new Set((data ?? []).map((row) => row.followed_id));
    },
  });
}
