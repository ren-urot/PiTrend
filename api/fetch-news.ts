import type { VercelRequest, VercelResponse } from '@vercel/node';

// Everything this function needs lives in this one file, deliberately —
// Vercel's Node function builder didn't bundle a relative import into a
// sibling module (ERR_MODULE_NOT_FOUND at runtime, confirmed live twice:
// once importing from ../src/lib, once from ./_lib within api/ itself),
// so there is no cross-file import for it to fail to resolve.

export type NewsCategory = 'pi_network' | 'crypto_update';

export interface ParsedNewsItem {
  title: string;
  url: string;
  source: string;
  summary: string | null;
  published_at: string;
  category: NewsCategory;
}

const HTML_ENTITIES: Record<string, string> = {
  '&#8211;': '–',
  '&#8212;': '—',
  '&#8216;': '‘',
  '&#8217;': '’',
  '&#8220;': '“',
  '&#8221;': '”',
  '&#8230;': '…',
  '&#038;': '&',
  '&amp;': '&',
  '&nbsp;': ' ',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&#?\w+;/g, (entity) => HTML_ENTITIES[entity] ?? entity).trim();
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  if (!match) return null;
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
}

/**
 * Parses a WordPress-style RSS 2.0 feed (crypto.news' format) into flat news
 * items. Deliberately regex-based rather than a full XML parser: the feed's
 * <item> blocks are simple and flat (no nested items), and this avoids
 * adding an XML-parsing dependency for a shape that's this predictable.
 */
export function parseRssFeed(xml: string, category: NewsCategory, source = 'crypto.news'): ParsedNewsItem[] {
  const items: ParsedNewsItem[] = [];
  const blocks = xml.split('<item>').slice(1).map((block) => block.split('</item>')[0]);

  for (const block of blocks) {
    const title = extractTag(block, 'title');
    const url = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const description = extractTag(block, 'description');

    if (!title || !url || !pubDate) continue;

    const publishedAt = new Date(pubDate);
    if (Number.isNaN(publishedAt.getTime())) continue;

    items.push({
      title: decodeHtmlEntities(title),
      url,
      source,
      summary: description ? decodeHtmlEntities(description) : null,
      published_at: publishedAt.toISOString(),
      category,
    });
  }

  return items;
}

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
