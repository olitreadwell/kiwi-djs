import type { Pool } from 'pg';
import { fetchHtml, sleep } from './http';
import { parseUtrHtml } from './undertheradar';
import { upsertEvent, linkDjToEvent } from './upsert';
import type { Scraper, ScrapeResult } from './types';

export const rogueScraper: Scraper = {
  source: 'rogue-vagabond',
  async run(pool: Pool): Promise<ScrapeResult> {
    const html = await fetchHtml('https://www.rogueandvagabond.co.nz');
    await sleep(500);
    const events = parseUtrHtml(html, this.source, 'The Rogue & Vagabond');
    let newCount = 0;
    for (const event of events) {
      const isNew = await upsertEvent(pool, { ...event, venue: 'The Rogue & Vagabond', source: this.source });
      if (isNew) newCount += 1;
      await linkDjToEvent(pool, event.id, event.name);
    }
    return { status: events.length > 0 ? 'ok' : 'error', items_found: events.length, items_new: newCount, error: events.length === 0 ? 'No events parsed' : undefined };
  },
};
