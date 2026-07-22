import type { NewsCategory } from '../types/news';

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
