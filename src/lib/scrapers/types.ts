import type { Pool } from 'pg';

export interface ScrapeResult {
  status: 'ok' | 'partial' | 'error';
  items_found: number;
  items_new: number;
  error?: string;
}

export interface Scraper {
  source: string;
  run(pool: Pool): Promise<ScrapeResult>;
}
