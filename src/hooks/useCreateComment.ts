import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface CreateCommentInput {
  postId: string;
  authorId: string;
  parentCommentId: string | null;
  body: string;
}

export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCommentInput) => {
      const { error } = await supabase.from('comments').insert({
        post_id: input.postId,
        author_id: input.authorId,
        parent_comment_id: input.parentCommentId,
        body: input.body,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['comments', variables.postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}
