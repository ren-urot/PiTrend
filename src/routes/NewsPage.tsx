import { useNews } from '../hooks/useNews';

export function NewsPage() {
  const { data: articles, isLoading } = useNews();

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Pi News</h1>
      {isLoading && <p className="text-muted-foreground">Loading news…</p>}
      {!isLoading && articles?.length === 0 && (
        <p className="text-muted-foreground">No news articles yet.</p>
      )}
      <div className="flex flex-col gap-4">
        {articles?.map((article) => (
          <a
            key={article.id}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col gap-1 rounded-lg border p-4 hover:bg-accent"
          >
            <span className="font-medium">{article.title}</span>
            {article.summary && (
              <span className="text-sm text-muted-foreground">{article.summary}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {article.source} · {new Date(article.published_at).toLocaleDateString()}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
