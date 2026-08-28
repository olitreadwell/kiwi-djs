import type { Pool } from 'pg';
import { upsertEvent, linkDjToEvent } from './upsert';
import type { Scraper, ScrapeResult } from './types';

interface EfEvent {
  id: number;
  name: string;
  url: string;
  start: string;
  venue?: { name?: string };
}

export const eventfindaScraper: Scraper = {
  source: 'eventfinda',
  async run(pool: Pool): Promise<ScrapeResult> {
    const key = process.env.EVENTFINDA_API_KEY;
    if (!key) {
      return { status: 'error', items_found: 0, items_new: 0, error: 'EVENTFINDA_API_KEY not set — skipping' };
    }
    const url = `https://api.eventfinda.co.nz/v2/events.json?region=wellington&rows=50&sort=start&fields=id,name,url,start,venue`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Eventfinda HTTP ${res.status}`);
    const data = (await res.json()) as { events?: EfEvent[] };
    let newCount = 0;
    for (const event of data.events ?? []) {
      const isNew = await upsertEvent(pool, {
        id: `eventfinda-${event.id}`,
        name: event.name,
        venue: event.venue?.name,
        startsAt: event.start ? new Date(event.start) : null,
        url: event.url,
        source: this.source,
      });
      if (isNew) newCount += 1;
      await linkDjToEvent(pool, `eventfinda-${event.id}`, event.name);
    }
    return { status: 'ok', items_found: data.events?.length ?? 0, items_new: newCount };
  },
};
