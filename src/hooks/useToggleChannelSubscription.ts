import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface ToggleChannelSubscriptionInput {
  channelId: string;
  userId: string;
  isSubscribed: boolean;
}

export function useToggleChannelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleChannelSubscriptionInput) => {
      if (input.isSubscribed) {
        const { error } = await supabase
          .from('channel_subscriptions')
          .delete()
          .eq('channel_id', input.channelId)
          .eq('user_id', input.userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('channel_subscriptions')
          .insert({ channel_id: input.channelId, user_id: input.userId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['channel-subscriptions', variables.userId] });
    },
  });
}
