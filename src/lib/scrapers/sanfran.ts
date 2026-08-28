import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { fetchHtml, sleep } from './http';
import { upsertEvent, linkDjToEvent } from './upsert';
import type { Scraper, ScrapeResult } from './types';

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

export function parseSanFranHtml(html: string): Array<{ id: string; name: string; startsAt: Date | null; url: string }> {
  const $ = cheerio.load(html);
  const events: Array<{ id: string; name: string; startsAt: Date | null; url: string }> = [];
  $('a[href*="/all-events/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const idMatch = href.match(/ae(\d+)/);
    if (!idMatch) return;
    const id = `sanfran-${idMatch[1]}`;
    if (events.some((e) => e.id === id)) return;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const dateMatch = text.match(/(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/);
    const name = (dateMatch ? text.replace(dateMatch[0], '') : text).trim();
    if (!name) return;
    let startsAt: Date | null = null;
    if (dateMatch) {
      const day = parseInt(dateMatch[1], 10);
      const month = MONTHS[dateMatch[2]];
      const year = parseInt(dateMatch[3], 10);
      if (month !== undefined) startsAt = new Date(Date.UTC(year, month, day, 19, 0));
    }
    events.push({ id, name, startsAt, url: `https://sanfran.co.nz${href.startsWith('/') ? href : `/${href}`}` });
  });
  return events;
}

export const sanfranScraper: Scraper = {
  source: 'sanfran',
  async run(pool: Pool): Promise<ScrapeResult> {
    const html = await fetchHtml('https://sanfran.co.nz');
    await sleep(500);
    const events = parseSanFranHtml(html);
    let newCount = 0;
    for (const event of events) {
      const isNew = await upsertEvent(pool, { ...event, venue: 'San Fran', source: this.source });
      if (isNew) newCount += 1;
      await linkDjToEvent(pool, event.id, event.name);
    }
    return { status: events.length > 0 ? 'ok' : 'error', items_found: events.length, items_new: newCount, error: events.length === 0 ? 'No events parsed' : undefined };
  },
};
