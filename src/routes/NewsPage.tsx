import { useState } from 'react';
import { ExternalLink, Newspaper, Share2, Check } from 'lucide-react';
import { useNews } from '../hooks/useNews';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { NewsArticle, NewsCategory } from '../types/news';

function ArticleList({ category }: { category: NewsCategory }) {
  const { data: articles, isLoading } = useNews(category);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleShare(article: NewsArticle) {
    if (navigator.share) {
      try {
        await navigator.share({ title: article.title, url: article.url });
      } catch {
        // User cancelled the share sheet — nothing to do.
      }
      return;
    }

    await navigator.clipboard.writeText(article.url);
    setCopiedId(article.id);
    setTimeout(() => setCopiedId((current) => (current === article.id ? null : current)), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      {isLoading && <p className="text-muted-foreground">Loading news…</p>}
      {!isLoading && articles?.length === 0 && (
        <p className="text-muted-foreground">No news articles yet.</p>
      )}
      {articles?.map((article) => (
        <Card key={article.id} className="transition-colors hover:bg-accent">
          <a href={article.url} target="_blank" rel="noopener noreferrer">
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
          </a>
          <CardFooter className="border-t pt-3">
            <button
              type="button"
              onClick={() => handleShare(article)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground"
            >
              {copiedId === article.id ? (
                <>
                  <Check size={18} className="text-mesh-teal" />
                  Link copied
                </>
              ) : (
                <>
                  <Share2 size={18} />
                  Share
                </>
              )}
            </button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

export function NewsPage() {
  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 flex items-center gap-2 text-base font-semibold md:text-xl">
        <Newspaper size={22} />
        News
      </h1>
      <Tabs defaultValue="pi_network">
        <TabsList className="mb-4">
          <TabsTrigger value="pi_network">Pi News</TabsTrigger>
          <TabsTrigger value="crypto_update">Crypto Update</TabsTrigger>
        </TabsList>
        <TabsContent value="pi_network">
          <ArticleList category="pi_network" />
        </TabsContent>
        <TabsContent value="crypto_update">
          <ArticleList category="crypto_update" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
