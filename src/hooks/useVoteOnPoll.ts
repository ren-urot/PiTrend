import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface VoteOnPollInput {
  postId: string;
  pollOptionId: string;
  voterId: string;
  cityId: string;
  channelId: string | null;
}

export function useVoteOnPoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: VoteOnPollInput) => {
      const { error } = await supabase.from('poll_votes').insert({
        post_id: input.postId,
        poll_option_id: input.pollOptionId,
        voter_id: input.voterId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.cityId, variables.channelId] });
    },
  });
}
