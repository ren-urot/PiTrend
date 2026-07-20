import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface CreateRepostInput {
  authorId: string;
  cityId: string;
  channelId: string | null;
  sharedPostId: string;
}

export function useCreateRepost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateRepostInput) => {
      const { error } = await supabase.from('posts').insert({
        author_id: input.authorId,
        city_id: input.cityId,
        channel_id: input.channelId,
        post_type: 'repost',
        body: null,
        shared_post_id: input.sharedPostId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.cityId, variables.channelId] });
    },
  });
}
