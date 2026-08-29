import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { fetchHtml, sleep } from './http';
import { upsertEvent, linkDjToEvent } from './upsert';
import type { Scraper, ScrapeResult } from './types';

interface EfEvent {
  id: number;
  name: string;
  url: string;
  start: string;
  venue?: { name?: string };
}

// Sitemap fallback (#44): Eventfinda's sitemap lists every event URL, so we
// can discover shows without an API key. Parse the hCalendar microformat on
// each event page for name/date/venue.
async function scrapeSitemap(pool: Pool): Promise<ScrapeResult> {
  const sitemap = await fetchHtml('https://www.eventfinda.co.nz/sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>(https:\/\/www\.eventfinda\.co\.nz\/\d{4}\/[^<]+)<\/loc>/g)]
    .map((match) => match[1])
    .filter((url) => url.includes('/wellington'))
    .slice(0, 30);
  let found = 0;
  let newCount = 0;
  for (const url of urls) {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      const name = $('h1.p-name').first().text().trim() || $('h1').first().text().trim();
      if (!name) continue;
      const datetime = $('[datetime]').first().attr('datetime') ?? '';
      const startsAt = datetime ? new Date(datetime.replace(/&ndash;.*$/, '').replace(',', '')) : null;
      const venue = $('.venue-name').first().text().trim() || undefined;
      const isNew = await upsertEvent(pool, {
        id: `eventfinda-sitemap-${createHash('sha1').update(url).digest('hex').slice(0, 12)}`,
        name,
        venue,
        startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
        url,
        source: 'eventfinda',
      });
      if (isNew) newCount += 1;
      await linkDjToEvent(pool, `eventfinda-sitemap-${createHash('sha1').update(url).digest('hex').slice(0, 12)}`, name);
      found += 1;
    } catch (err) {
      console.log(`  eventfinda-sitemap: ${url} → error (${err instanceof Error ? err.message : String(err)})`);
    }
    await sleep(500);
  }
  return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: newCount, error: found === 0 ? 'No sitemap events parsed' : undefined };
}

export const eventfindaScraper: Scraper = {
  source: 'eventfinda',
  async run(pool: Pool): Promise<ScrapeResult> {
    const key = process.env.EVENTFINDA_API_KEY;
    if (!key) {
      return scrapeSitemap(pool);
    }
    const url = `https://api.eventfinda.co.nz/v2/events.json?region=wellington&rows=50&sort=start&fields=id,name,url,start,venue`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Eventfinda HTTP ${res.status}`);
    const data = (await res.json()) as { events?: EfEvent[] };
    let newCount = 0;
    for (const event of data.events ?? []) {
      const isNew = await upsertEvent(pool, {
        id: `eventfinda-${event.id}`,
        name: event.name,
        venue: event.venue?.name,
        startsAt: event.start ? new Date(event.start) : null,
        url: event.url,
        source: this.source,
      });
      if (isNew) newCount += 1;
      await linkDjToEvent(pool, `eventfinda-${event.id}`, event.name);
    }
    return { status: 'ok', items_found: data.events?.length ?? 0, items_new: newCount };
  },
};
