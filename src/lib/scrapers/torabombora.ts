import type { Pool } from 'pg';
import { fetchHtml } from './http';
import type { Scraper, ScrapeResult } from './types';

const LINEUP_URL = 'https://www.torabombora.co.nz/lineup';

export const toraBomboraScraper: Scraper = {
  source: 'tora-bombora',
  async run(pool: Pool): Promise<ScrapeResult> {
    void pool;
    const html = await fetchHtml(LINEUP_URL);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/all will be revealed soon/i.test(text)) {
      return { status: 'partial', items_found: 0, items_new: 0, error: 'No lineup announced yet' };
    }
    return { status: 'partial', items_found: 0, items_new: 0, error: 'Lineup page fetched but no artist names extracted' };
  },
};
