import type { Pool } from 'pg';
import { checkRobots, UA } from './http';
import { ingestFestivalLineup } from './festival';
import type { Scraper, ScrapeResult } from './types';

const GRAPHQL_URL = 'https://ra.co/graphql';

// Resident Advisor event pages are DataDome-captcha-gated, but the GraphQL
// API behind the site is open. Add event IDs here as they're requested.
const EVENT_IDS = ['2468041']; // Carlucci Carnival @ Carlucci Land, 2026-09-26

interface RaArtist {
  id: string;
  name: string;
}

interface RaEvent {
  id: string;
  title: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  venue?: { id: string; name: string };
  artists?: RaArtist[];
}

async function fetchRaEvent(eventId: string): Promise<RaEvent> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://ra.co',
      referer: `https://ra.co/events/${eventId}`,
      'user-agent': UA,
    },
    body: JSON.stringify({
      query: 'query Event($id: ID!) { event(id: $id) { id title date startTime endTime venue { id name } artists { id name } } }',
      variables: { id: eventId },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RA GraphQL HTTP ${res.status}`);
  const data = (await res.json()) as { data?: { event?: RaEvent | null } };
  const event = data.data?.event;
  if (!event) throw new Error(`RA event ${eventId} not found`);
  return event;
}

export const residentAdvisorScraper: Scraper = {
  source: 'resident-advisor',
  async run(pool: Pool): Promise<ScrapeResult> {
    if (!(await checkRobots(`https://ra.co/events/${EVENT_IDS[0]}`))) {
      return { status: 'error', items_found: 0, items_new: 0, error: 'Blocked by robots.txt' };
    }
    let found = 0;
    let newCount = 0;
    for (const eventId of EVENT_IDS) {
      const event = await fetchRaEvent(eventId);
      const artists = (event.artists ?? [])
        .map((artist) => artist.name.replace(/\s*\((?:NZ|CA|UK|US|AU|DE|FR|NL|BE|ES|IT|JP)\)\s*$/i, '').trim())
        .filter(Boolean);
      const result = await ingestFestivalLineup(pool, this.source, {
        eventIdPrefix: `ra-${eventId}`,
        eventName: event.title,
        venue: event.venue?.name,
        startsAt: event.startTime ? new Date(event.startTime) : null,
        url: `https://ra.co/events/${eventId}`,
        artists,
        includeAll: true,
        djSource: 'resident-advisor',
      });
      found += result.items_found;
      newCount += result.items_new;
    }
    return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: newCount, error: found === 0 ? 'No artists parsed' : undefined };
  },
};
