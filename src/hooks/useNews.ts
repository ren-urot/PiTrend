import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { NewsArticle, NewsCategory } from '../types/news';

export function useNews(category: NewsCategory) {
  return useQuery({
    queryKey: ['news', category],
    queryFn: async (): Promise<NewsArticle[]> => {
      const { data, error } = await supabase
        .from('news_articles')
        .select('id, title, url, source, summary, published_at, category')
        .eq('category', category)
        .order('published_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}
