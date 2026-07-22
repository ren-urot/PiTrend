import { describe, it, expect } from 'vitest';
import { parseRssFeed, decodeHtmlEntities } from './newsFeedParser';

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0">
<channel>
	<title>Pi Network &#8211; crypto.news</title>
	<link>https://crypto.news</link>
	<item>
		<title>Will Protocol v25 push Pi Network price beyond $0.10?</title>
		<link>https://crypto.news/will-protocol-v25-push-pi-network-price-beyond-0-10/</link>
		<dc:creator><![CDATA[Rony Roy]]></dc:creator>
		<pubDate>Tue, 21 Jul 2026 12:30:00 +0000</pubDate>
		<category><![CDATA[Markets]]></category>
		<guid isPermaLink="false">https://crypto.news/?p=14473908</guid>
		<description><![CDATA[Pi Network price has rebounded nearly 39% from its July 14 all-time low as traders position for the Protocol v25 upgrade&#8230;]]></description>
		<media:content url="https://media.crypto.news/2026/07/Pi2.webp" medium="image"/>
	</item>
	<item>
		<title>PI Network price nears $0.10 after 11% surge, but can the rally hold?</title>
		<link>https://crypto.news/pi-network-price-nears-0-10-after-11-surge-but-can-the-rally-hold/</link>
		<pubDate>Mon, 20 Jul 2026 11:11:07 +0000</pubDate>
		<description><![CDATA[PI climbed over 11% in the past 24 hours&#8230;]]></description>
	</item>
	<item>
		<title>Missing a link</title>
		<pubDate>Mon, 20 Jul 2026 11:11:07 +0000</pubDate>
		<description><![CDATA[Should be skipped since it has no link.]]></description>
	</item>
</channel>
</rss>`;

describe('decodeHtmlEntities', () => {
  it('decodes common WordPress RSS entities', () => {
    expect(decodeHtmlEntities('Pi Network &#8211; crypto.news')).toBe('Pi Network – crypto.news');
    expect(decodeHtmlEntities('rebounded&#8230;')).toBe('rebounded…');
    expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
  });

  it('leaves unknown entities untouched rather than dropping them', () => {
    expect(decodeHtmlEntities('&#9999; unknown')).toBe('&#9999; unknown');
  });
});

describe('parseRssFeed', () => {
  it('parses each item into a flat news item, tagged with the given category', () => {
    const items = parseRssFeed(SAMPLE_FEED, 'pi_network');

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'Will Protocol v25 push Pi Network price beyond $0.10?',
      url: 'https://crypto.news/will-protocol-v25-push-pi-network-price-beyond-0-10/',
      source: 'crypto.news',
      summary: 'Pi Network price has rebounded nearly 39% from its July 14 all-time low as traders position for the Protocol v25 upgrade…',
      published_at: new Date('Tue, 21 Jul 2026 12:30:00 +0000').toISOString(),
      category: 'pi_network',
    });
  });

  it('skips items missing a link (no url to store)', () => {
    const items = parseRssFeed(SAMPLE_FEED, 'pi_network');
    expect(items.some((item) => item.title === 'Missing a link')).toBe(false);
  });

  it('tags items with the requested category', () => {
    const items = parseRssFeed(SAMPLE_FEED, 'crypto_update');
    expect(items.every((item) => item.category === 'crypto_update')).toBe(true);
  });

  it('returns an empty array for a feed with no items', () => {
    expect(parseRssFeed('<rss><channel></channel></rss>', 'pi_network')).toEqual([]);
  });
});
