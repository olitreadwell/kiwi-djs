import type { Pool } from 'pg';
import { fetchHtml } from './http';
import type { Scraper, ScrapeResult } from './types';

const LINEUP_URL = 'https://www.jambase.com/festival/cubadupa-2026';

export const jamBaseScraper: Scraper = {
  source: 'jambase',
  async run(pool: Pool): Promise<ScrapeResult> {
    void pool;
    const html = await fetchHtml(LINEUP_URL);
    if (/safeguarding|real person|automated bad bot/i.test(html)) {
      return { status: 'partial', items_found: 0, items_new: 0, error: 'Bot-gated (BigScoots captcha) — needs headless browser' };
    }
    return { status: 'partial', items_found: 0, items_new: 0, error: 'Lineup page fetched but no artist names extracted' };
  },
};
