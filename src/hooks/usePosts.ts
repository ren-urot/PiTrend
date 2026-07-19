import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Post } from '../types/post';

interface UsePostsParams {
  cityId: string | undefined;
  channelId: string | null;
  viewerId: string | undefined;
}

export function usePosts({ cityId, channelId, viewerId }: UsePostsParams) {
  return useQuery({
    queryKey: ['posts', cityId, channelId],
    queryFn: async (): Promise<Post[]> => {
      if (!cityId) return [];

      const baseQuery = supabase
        .from('posts')
        .select(
          'id, author_id, city_id, channel_id, post_type, body, shared_post_id, created_at, ' +
            'author:profiles!posts_author_id_fkey(username, display_name, avatar_url), ' +
            'post_media(media_url, media_type, duration_seconds), ' +
            'likes(count), comments(count)'
        );

      const scopedQuery = channelId
        ? baseQuery.eq('channel_id', channelId)
        : baseQuery.eq('city_id', cityId).is('channel_id', null);

      const { data, error } = await scopedQuery.order('created_at', { ascending: false }).limit(20);
      if (error) throw error;

      const rows = data ?? [];
      const postIds = rows.map((row: any) => row.id);

      let likedIds = new Set<string>();
      let bookmarkedIds = new Set<string>();

      if (viewerId && postIds.length > 0) {
        const [{ data: likedRows }, { data: bookmarkedRows }] = await Promise.all([
          supabase.from('likes').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
          supabase.from('bookmarks').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
        ]);
        likedIds = new Set((likedRows ?? []).map((row: any) => row.post_id));
        bookmarkedIds = new Set((bookmarkedRows ?? []).map((row: any) => row.post_id));
      }

      return rows.map((row: any) => ({
        id: row.id,
        author_id: row.author_id,
        city_id: row.city_id,
        channel_id: row.channel_id,
        post_type: row.post_type,
        body: row.body,
        shared_post_id: row.shared_post_id,
        created_at: row.created_at,
        author: row.author,
        post_media: row.post_media ?? null,
        like_count: row.likes?.[0]?.count ?? 0,
        comment_count: row.comments?.[0]?.count ?? 0,
        viewer_has_liked: likedIds.has(row.id),
        viewer_has_bookmarked: bookmarkedIds.has(row.id),
      }));
    },
    enabled: !!cityId,
  });
}
