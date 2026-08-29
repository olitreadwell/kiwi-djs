import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { fetchHtml } from './http';
import { ingestFestivalLineup } from './festival';
import type { Scraper, ScrapeResult } from './types';

const LINEUP_URL = 'https://northernbass.co.nz/lineup';

export function parseNorthernBassLineup(html: string): string[] {
  const $ = cheerio.load(html);
  const names: string[] = [];
  $('h3 span').each((_, el) => {
    const name = $(el).text().replace(/\s+/g, ' ').trim();
    if (name) names.push(name);
  });
  return names;
}

export const northernBassScraper: Scraper = {
  source: 'northern-bass',
  async run(pool: Pool): Promise<ScrapeResult> {
    const html = await fetchHtml(LINEUP_URL);
    const artists = parseNorthernBassLineup(html);
    return ingestFestivalLineup(pool, this.source, {
      eventIdPrefix: 'northern-bass-2026',
      eventName: 'Northern Bass 2026',
      venue: 'Kaiwaka, Northland',
      startsAt: new Date('2026-12-30T00:00:00Z'),
      url: LINEUP_URL,
      artists,
      includeAll: true,
    });
  },
};
