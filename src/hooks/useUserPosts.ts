import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { POST_SELECT_FIELDS, fetchViewerPostState, mapPostRow } from '../lib/postMapping';
import type { Post } from '../types/post';

interface UseUserPostsParams {
  authorId: string | undefined;
  viewerId: string | undefined;
}

export function useUserPosts({ authorId, viewerId }: UseUserPostsParams) {
  return useQuery({
    queryKey: ['user-posts', authorId],
    queryFn: async (): Promise<Post[]> => {
      if (!authorId) return [];

      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT_FIELDS)
        .eq('author_id', authorId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;

      const rows = data ?? [];
      const postIds = rows.map((row: any) => row.id);
      const viewerState = await fetchViewerPostState(postIds, viewerId);

      return rows.map((row: any) => mapPostRow(row, viewerState));
    },
  });
}
