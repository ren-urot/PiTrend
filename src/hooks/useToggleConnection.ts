import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface ToggleConnectionInput {
  followerId: string;
  followedId: string;
  isFollowing: boolean;
}

export function useToggleConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleConnectionInput) => {
      if (input.isFollowing) {
        const { error } = await supabase
          .from('connections')
          .delete()
          .eq('follower_id', input.followerId)
          .eq('followed_id', input.followedId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('connections')
          .insert({ follower_id: input.followerId, followed_id: input.followedId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my-followed-ids', variables.followerId] });
      queryClient.invalidateQueries({ queryKey: ['connections', variables.followerId] });
    },
  });
}
