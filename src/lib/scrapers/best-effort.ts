import { fetchHtml } from './http';
import type { Scraper, ScrapeResult } from './types';

// Sources that are JS-rendered, bot-gated, or otherwise unreliable.
// Each run attempts a fetch; failures are recorded in the scrapes table, not fatal.
function bestEffortScraper(source: string, url: string): Scraper {
  return {
    source,
    async run(): Promise<ScrapeResult> {
      try {
        const html = await fetchHtml(url);
        if (html.length < 500) {
          return { status: 'error', items_found: 0, items_new: 0, error: `Response too small (${html.length} bytes) — likely JS-gated` };
        }
        return { status: 'partial', items_found: 0, items_new: 0, error: 'Fetched but no structured data extracted yet' };
      } catch (err) {
        return { status: 'error', items_found: 0, items_new: 0, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export const bestEffortScrapers: Scraper[] = [
  bestEffortScraper('ivy-bar', 'https://ivybar.co.nz'),
  bestEffortScraper('the-third-eye', 'https://thethirdeye.co.nz'),
  bestEffortScraper('caroline', 'https://www.caroline.co.nz'),
  bestEffortScraper('100-percent-wellington', 'https://www.100percent.co.nz'),
  bestEffortScraper('bfm-radio', 'https://www.bfm.co.nz/radio/shows'),
  bestEffortScraper('resident-advisor', 'https://ra.co/clubs/wellington'),
];
