export type PostType =
  | 'text'
  | 'photo'
  | 'video'
  | 'poll'
  | 'question'
  | 'buy_sell'
  | 'merchant_promo'
  | 'announcement'
  | 'repost';

export interface PostAuthor {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface PostMedia {
  media_url: string;
  media_type: 'photo' | 'video';
  duration_seconds: number | null;
}

export interface Post {
  id: string;
  author_id: string;
  city_id: string;
  channel_id: string | null;
  post_type: PostType;
  body: string | null;
  shared_post_id: string | null;
  created_at: string;
  author: PostAuthor;
  post_media: PostMedia | null;
  like_count: number;
  comment_count: number;
  viewer_has_liked: boolean;
  viewer_has_bookmarked: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  author: PostAuthor;
}
