import { ExternalLink, Newspaper } from 'lucide-react';
import { useNews } from '../hooks/useNews';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export function NewsPage() {
  const { data: articles, isLoading } = useNews();

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold">
        <Newspaper size={22} />
        Pi News
      </h1>
      {isLoading && <p className="text-muted-foreground">Loading news…</p>}
      {!isLoading && articles?.length === 0 && (
        <p className="text-muted-foreground">No news articles yet.</p>
      )}
      <div className="flex flex-col gap-4">
        {articles?.map((article) => (
          <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer">
            <Card className="transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <span>{article.title}</span>
                  <ExternalLink size={16} className="mt-1 shrink-0 text-muted-foreground" />
                </CardTitle>
                {article.summary && <CardDescription>{article.summary}</CardDescription>}
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {article.source} · {new Date(article.published_at).toLocaleDateString()}
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
