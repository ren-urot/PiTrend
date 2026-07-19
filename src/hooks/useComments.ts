import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Comment } from '../types/post';

export function useComments(postId: string) {
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('comments')
        .select(
          'id, post_id, author_id, parent_comment_id, body, created_at, ' +
            'author:profiles!comments_author_id_fkey(username, display_name, avatar_url)'
        )
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
    },
  });
}
