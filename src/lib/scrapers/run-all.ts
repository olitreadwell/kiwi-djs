import type { Pool } from 'pg';
import { undertheradarScraper } from './undertheradar';
import { sanfranScraper } from './sanfran';
import { rogueScraper } from './rogue';
import { soundcloudScraper } from './soundcloud';
import { eventfindaScraper } from './eventfinda';
import { bestEffortScrapers } from './best-effort';
import { enrichAllDjs } from './enrich';
import { discoverAll } from './discover';
import type { Scraper, ScrapeResult } from './types';

const scrapers: Scraper[] = [
  undertheradarScraper,
  sanfranScraper,
  rogueScraper,
  soundcloudScraper,
  eventfindaScraper,
  ...bestEffortScrapers,
];

export async function runAllScrapers(pool: Pool): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  for (const scraper of scrapers) {
    const startedAt = new Date();
    let result: ScrapeResult;
    try {
      result = await scraper.run(pool);
    } catch (err) {
      result = { status: 'error', items_found: 0, items_new: 0, error: err instanceof Error ? err.message : String(err) };
    }
    await pool.query(
      `INSERT INTO scrapes (source, status, items_found, items_new, error, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [scraper.source, result.status, result.items_found, result.items_new, result.error ?? null, startedAt],
    );
    results.push(result);
  }
  results.push(...(await discoverAll(pool)));
  results.push(...(await enrichAllDjs(pool)));
  return results;
}
