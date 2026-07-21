import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface CreateNewsCommentInput {
  articleId: string;
  authorId: string;
  parentCommentId: string | null;
  body: string;
}

export function useCreateNewsComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateNewsCommentInput) => {
      const { error } = await supabase.from('news_comments').insert({
        article_id: input.articleId,
        author_id: input.authorId,
        parent_comment_id: input.parentCommentId,
        body: input.body,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['news-comments', variables.articleId] });
    },
  });
}
