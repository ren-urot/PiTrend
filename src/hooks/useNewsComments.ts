import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { NewsComment } from '../types/news';

export function useNewsComments(articleId: string) {
  return useQuery({
    queryKey: ['news-comments', articleId],
    queryFn: async (): Promise<NewsComment[]> => {
      const { data, error } = await supabase
        .from('news_comments')
        .select(
          'id, article_id, author_id, parent_comment_id, body, created_at, ' +
            'author:profiles!news_comments_author_id_fkey(username, display_name, avatar_url)'
        )
        .eq('article_id', articleId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as NewsComment[];
    },
  });
}
