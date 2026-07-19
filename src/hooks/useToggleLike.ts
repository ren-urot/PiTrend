import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface ToggleLikeInput {
  postId: string;
  userId: string;
  isLiked: boolean;
  cityId: string;
  channelId: string | null;
}

export function useToggleLike() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleLikeInput) => {
      if (input.isLiked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('post_id', input.postId)
          .eq('user_id', input.userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({ post_id: input.postId, user_id: input.userId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.cityId, variables.channelId] });
    },
  });
}
