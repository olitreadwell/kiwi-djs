import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { fetchHtml } from './http';
import { ingestFestivalLineup, type FestivalArtist } from './festival';
import type { Scraper, ScrapeResult } from './types';

const LINEUP_URL = 'https://www.newtownfestival.org.nz/artists/';

export function parseNewtownLineup(html: string): FestivalArtist[] {
  const $ = cheerio.load(html);
  const artists: FestivalArtist[] = [];
  $('.performer').each((_, el) => {
    const name = $(el).find('h2 a').first().text().replace(/\s+/g, ' ').trim();
    const description = $(el).find('p').first().text().replace(/\s+/g, ' ').trim();
    if (name) artists.push({ name, description });
  });
  return artists;
}

export const newtownFestivalScraper: Scraper = {
  source: 'newtown-festival',
  async run(pool: Pool): Promise<ScrapeResult> {
    const html = await fetchHtml(LINEUP_URL);
    const artists = parseNewtownLineup(html);
    return ingestFestivalLineup(pool, this.source, {
      eventIdPrefix: 'newtown-festival-2027',
      eventName: 'Newtown Festival 2027',
      venue: 'Newtown, Wellington',
      startsAt: new Date('2027-03-07T00:00:00Z'),
      url: LINEUP_URL,
      artists,
    });
  },
};
