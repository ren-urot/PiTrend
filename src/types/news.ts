export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  summary: string | null;
  published_at: string;
}
