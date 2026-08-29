import type { Pool } from 'pg';
import { undertheradarScraper } from './undertheradar';
import { sanfranScraper } from './sanfran';
import { rogueScraper } from './rogue';
import { radioactiveScraper } from './radioactive';
import { soundcloudScraper } from './soundcloud';
import { eventfindaScraper } from './eventfinda';
import { northernBassScraper } from './northernbass';
import { othersWayScraper } from './theothersway';
import { snowMachineScraper } from './snowmachine';
import { newtownFestivalScraper } from './newtownfestival';
import { earthbeatScraper } from './earthbeat';
import { toraBomboraScraper } from './torabombora';
import { jamBaseScraper } from './jambase';
import { residentAdvisorScraper } from './residentadvisor';
import { bestEffortScrapers } from './best-effort';
import { enrichAllDjs } from './enrich';
import { enrichVenueRegions } from './apis';
import { discoverAll, verifyDiscovered } from './discover';
import type { Scraper, ScrapeResult } from './types';

const scrapers: Scraper[] = [
  undertheradarScraper,
  sanfranScraper,
  rogueScraper,
  radioactiveScraper,
  soundcloudScraper,
  eventfindaScraper,
  northernBassScraper,
  othersWayScraper,
  snowMachineScraper,
  newtownFestivalScraper,
  earthbeatScraper,
  toraBomboraScraper,
  jamBaseScraper,
  residentAdvisorScraper,
  ...bestEffortScrapers,
  { source: 'enrich-venue-regions', run: enrichVenueRegions },
];

export async function runAllScrapers(
  pool: Pool,
  options: { disabledSources?: Set<string> } = {},
): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  const activeScrapers = options.disabledSources
    ? scrapers.filter((scraper) => !options.disabledSources?.has(scraper.source))
    : scrapers;
  for (const scraper of activeScrapers) {
    const startedAt = new Date();
    let result: ScrapeResult;
    try {
      result = await scraper.run(pool);
      result.source = scraper.source;
    } catch (err) {
      result = { source: scraper.source, status: 'error', items_found: 0, items_new: 0, error: err instanceof Error ? err.message : String(err) };
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
  // Second verification pass after enrichment so a candidate that just
  // gained mixes/links/articles is promoted in the same cycle.
  const verifyAfter = await verifyDiscovered(pool);
  await pool.query(
    `INSERT INTO scrapes (source, status, items_found, items_new, error, started_at, finished_at)
     VALUES ('verify-discovered', $1, $2, $2, NULL, now(), now())`,
    [verifyAfter.status, verifyAfter.items_found],
  );
  results.push(verifyAfter);
  return results;
}
