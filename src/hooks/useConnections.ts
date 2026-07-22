import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ConnectedProfile } from '../types/connection';

export function useConnections(userId: string | undefined) {
  return useQuery({
    queryKey: ['connections', userId],
    queryFn: async (): Promise<ConnectedProfile[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('connections')
        .select('followed_id, created_at, profiles!connections_followed_id_fkey(id, username, display_name, avatar_url)')
        .eq('follower_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      return (data ?? []).map((row: any) => row.profiles);
    },
  });
}
