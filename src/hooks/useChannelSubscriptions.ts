import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useChannelSubscriptions(userId: string | undefined) {
  return useQuery({
    queryKey: ['channel-subscriptions', userId],
    queryFn: async (): Promise<string[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('channel_subscriptions')
        .select('channel_id')
        .eq('user_id', userId);
      if (error) throw error;
      return (data ?? []).map((row: any) => row.channel_id);
    },
    enabled: !!userId,
  });
}
