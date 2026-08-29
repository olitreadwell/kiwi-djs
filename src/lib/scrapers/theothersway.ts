import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { fetchHtml } from './http';
import { ingestFestivalLineup } from './festival';
import type { Scraper, ScrapeResult } from './types';

const LINEUP_URL = 'https://www.theothersway.co.nz/lineup';

export function parseOthersWayLineup(html: string): string[] {
  const $ = cheerio.load(html);
  const names: string[] = [];
  $('a[href^="/lineup/"]').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text || text === 'Read More') return;
    names.push(text);
  });
  return [...new Set(names)];
}

export const othersWayScraper: Scraper = {
  source: 'the-others-way',
  async run(pool: Pool): Promise<ScrapeResult> {
    const html = await fetchHtml(LINEUP_URL);
    const artists = parseOthersWayLineup(html);
    return ingestFestivalLineup(pool, this.source, {
      eventIdPrefix: 'the-others-way-2025',
      eventName: 'The Others Way 2025',
      venue: 'Auckland',
      startsAt: null,
      url: LINEUP_URL,
      artists,
      include: ['BabeTech', 'Bbyfacekilla', 'Christoph El Truento', 'Geneva AM', 'High Dependency Unit', 'Caru & Brandn Shiraz', 'Elliot & Vincent'],
    });
  },
};
