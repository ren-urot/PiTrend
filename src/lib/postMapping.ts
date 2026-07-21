import { supabase } from './supabase';
import type { Post } from '../types/post';

export const POST_SELECT_FIELDS =
  'id, author_id, city_id, channel_id, post_type, body, shared_post_id, created_at, ' +
  'author:profiles!posts_author_id_fkey(username, display_name, avatar_url), ' +
  'post_media(media_url, media_type, duration_seconds), ' +
  'poll_options(id, option_text, display_order, poll_votes(count)), ' +
  'post_buy_sell(price_amount, price_currency, category), ' +
  'shared_post:posts!shared_post_id(id, post_type, body, ' +
  'author:profiles!posts_author_id_fkey(username, display_name, avatar_url), ' +
  'post_media(media_url, media_type, duration_seconds)), ' +
  'likes(count), comments(count)';

export interface ViewerPostState {
  likedIds: Set<string>;
  bookmarkedIds: Set<string>;
  viewerVotes: Map<string, string>;
}

export async function fetchViewerPostState(
  postIds: string[],
  viewerId: string | undefined
): Promise<ViewerPostState> {
  if (!viewerId || postIds.length === 0) {
    return { likedIds: new Set(), bookmarkedIds: new Set(), viewerVotes: new Map() };
  }

  const [{ data: likedRows }, { data: bookmarkedRows }, { data: voteRows }] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
    supabase.from('bookmarks').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
    supabase.from('poll_votes').select('post_id, poll_option_id').eq('voter_id', viewerId).in('post_id', postIds),
  ]);

  return {
    likedIds: new Set((likedRows ?? []).map((row: any) => row.post_id)),
    bookmarkedIds: new Set((bookmarkedRows ?? []).map((row: any) => row.post_id)),
    viewerVotes: new Map((voteRows ?? []).map((row: any) => [row.post_id, row.poll_option_id])),
  };
}

export function mapPostRow(row: any, viewerState: ViewerPostState): Post {
  return {
    id: row.id,
    author_id: row.author_id,
    city_id: row.city_id,
    channel_id: row.channel_id,
    post_type: row.post_type,
    body: row.body,
    shared_post_id: row.shared_post_id,
    shared_post: row.shared_post ?? null,
    created_at: row.created_at,
    author: row.author,
    post_media: row.post_media ?? null,
    poll:
      row.poll_options && row.poll_options.length > 0
        ? {
            options: [...row.poll_options]
              .sort((a: any, b: any) => a.display_order - b.display_order)
              .map((option: any) => ({
                id: option.id,
                option_text: option.option_text,
                display_order: option.display_order,
                vote_count: option.poll_votes?.[0]?.count ?? 0,
              })),
            viewer_vote_option_id: viewerState.viewerVotes.get(row.id) ?? null,
          }
        : null,
    buy_sell: row.post_buy_sell ?? null,
    like_count: row.likes?.[0]?.count ?? 0,
    comment_count: row.comments?.[0]?.count ?? 0,
    viewer_has_liked: viewerState.likedIds.has(row.id),
    viewer_has_bookmarked: viewerState.bookmarkedIds.has(row.id),
  };
}
