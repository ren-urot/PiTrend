export type NewsCategory = 'pi_network' | 'crypto_update';

export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  summary: string | null;
  published_at: string;
  category: NewsCategory;
}

export interface NewsCommentAuthor {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface NewsComment {
  id: string;
  article_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  author: NewsCommentAuthor;
}
