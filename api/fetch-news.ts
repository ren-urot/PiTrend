import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseRssFeed, type ParsedNewsItem } from '../src/lib/newsFeedParser';
import type { NewsCategory } from '../src/types/news';

const FEEDS: { url: string; category: NewsCategory }[] = [
  { url: 'https://crypto.news/tag/pi-network/feed/', category: 'pi_network' },
  { url: 'https://crypto.news/feed/', category: 'crypto_update' },
];

async function fetchAndParseFeed(feed: { url: string; category: NewsCategory }): Promise<ParsedNewsItem[]> {
  const response = await fetch(feed.url, { headers: { 'User-Agent': 'PiTrendNewsBot/1.0' } });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${feed.url}: ${response.status}`);
  }
  const xml = await response.text();
  return parseRssFeed(xml, feed.category);
}

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when
// a CRON_SECRET env var is set on the project — this is the documented way
// to keep this endpoint from being triggered by anyone who finds the URL.
function isAuthorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
    return;
  }

  try {
    const results = await Promise.allSettled(FEEDS.map(fetchAndParseFeed));
    const items = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    const failures = results
      .map((result, index) => (result.status === 'rejected' ? { feed: FEEDS[index].url, error: String(result.reason) } : null))
      .filter((failure): failure is { feed: string; error: string } => failure !== null);

    if (items.length === 0) {
      res.status(502).json({ error: 'No articles parsed from any feed', failures });
      return;
    }

    // news_articles.url has a unique constraint (migration 0014); ignoring
    // conflicts on it is how re-running this daily avoids re-inserting
    // articles it already stored, without needing to fetch existing URLs
    // first just to diff them client-side.
    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/news_articles?on_conflict=url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(items),
    });

    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      res.status(502).json({ error: errorText });
      return;
    }

    res.status(200).json({ parsed: items.length, failures });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
