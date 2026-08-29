import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { fetchHtml } from './http';
import { ingestFestivalLineup } from './festival';
import type { Scraper, ScrapeResult } from './types';

const LINEUP_URL = 'https://nz.snow-machine.com/artists/';

export function parseSnowMachineLineup(html: string): string[] {
  const $ = cheerio.load(html);
  const names: string[] = [];
  $('a[href*="/artists/"] .title span').each((_, el) => {
    const name = $(el).text().replace(/\s+/g, ' ').trim();
    if (name) names.push(name);
  });
  return [...new Set(names)];
}

export const snowMachineScraper: Scraper = {
  source: 'snow-machine',
  async run(pool: Pool): Promise<ScrapeResult> {
    const html = await fetchHtml(LINEUP_URL);
    const artists = parseSnowMachineLineup(html);
    return ingestFestivalLineup(pool, this.source, {
      eventIdPrefix: 'snow-machine-2026',
      eventName: 'Snow Machine 2026',
      venue: 'Queenstown',
      startsAt: null,
      url: LINEUP_URL,
      artists,
      includeAll: true,
      exclude: ['Hilltop Hoods', 'Chet Faker', 'Example', 'Illy', 'Scribe', 'Savage', 'Shannon Noll', 'Keli Holiday'],
    });
  },
};
