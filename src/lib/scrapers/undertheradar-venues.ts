import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { fetchHtmlCached, sleep } from './http';
import { parseUtrDate } from './undertheradar';
import { upsertEvent, linkDjToEvent } from './upsert';
import type { Scraper, ScrapeResult } from './types';

// Curated popular venues that frequently host DJs (#32). Feed format:
// https://www.undertheradar.co.nz/feeds/showsRssVenues.php?venue=<id>
const VENUES: Array<{ id: number; name: string }> = [
  { id: 6943, name: 'Afters.' },
  { id: 3408, name: 'MOON' },
  { id: 3365, name: 'San Fran' },
  { id: 6638, name: 'Cuba St Tavern' },
  { id: 5290, name: 'The Pow Wow Room' },
  { id: 3171, name: 'Valhalla' },
  // Auckland — the main DJ-friendly rooms (via UTR gig-guide crawl, #36)
  { id: 316, name: 'Whammy Bar' },
  { id: 6373, name: 'Double Whammy' },
  { id: 6921, name: 'Whammy Public Bar' },
  { id: 1648, name: 'Ponsonby Social Club' },
  { id: 2140, name: 'Audio Foundation' },
];

interface RssItem {
  title: string;
  description: string;
  link: string;
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
    const description = block.match(/<description>(.*?)<\/description>/)?.[1] ?? '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
    if (title && link) items.push({ title, description, link });
  }
  return items;
}

export const undertheradarVenuesScraper: Scraper = {
  source: 'undertheradar-venues',
  async run(pool: Pool): Promise<ScrapeResult> {
    let found = 0;
    let newCount = 0;
    for (const venue of VENUES) {
      const url = `https://www.undertheradar.co.nz/feeds/showsRssVenues.php?venue=${venue.id}`;
      try {
        const xml = await fetchHtmlCached(url);
        if (xml === null) continue;
        for (const item of parseRss(xml)) {
          // Description: "Afters., Wellington, Sat, 10 October"
          const dateMatch = item.description.match(/(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+)/);
          const startsAt = dateMatch ? parseUtrDate(dateMatch[1], '') : null;
          const eventId = `utr-venue-${createHash('sha1').update(item.link).digest('hex').slice(0, 12)}`;
          const isNew = await upsertEvent(pool, {
            id: eventId,
            name: item.title,
            venue: venue.name,
            startsAt,
            url: item.link,
            source: this.source,
          });
          if (isNew) newCount += 1;
          await linkDjToEvent(pool, eventId, item.title);
          found += 1;
        }
      } catch (err) {
        console.log(`  undertheradar-venues: ${venue.name} → error (${err instanceof Error ? err.message : String(err)})`);
      }
      await sleep(500);
    }
    return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: newCount, error: found === 0 ? 'No venue RSS items parsed' : undefined };
  },
};
