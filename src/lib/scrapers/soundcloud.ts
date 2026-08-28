import type { Pool } from 'pg';
import { sleep } from './http';
import type { Scraper, ScrapeResult } from './types';

// Public web client id, widely documented in open-source SoundCloud tooling.
const DEFAULT_CLIENT_ID = 'iZIs9mchVcX5lhVRyQGGAYlNtmpld4pT';

interface ScUser {
  username: string;
  permalink: string;
  description?: string;
  city?: string;
  avatar_url?: string;
}

export const soundcloudScraper: Scraper = {
  source: 'soundcloud',
  async run(pool: Pool): Promise<ScrapeResult> {
    const clientId = process.env.SOUNDCLOUD_CLIENT_ID || DEFAULT_CLIENT_ID;
    const queries = ['wellington dj', 'wellington djs', 'wellington techno', 'wellington drum and bass'];
    const seen = new Set<string>();
    let newCount = 0;
    let found = 0;
    for (const query of queries) {
      const url = `https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=10&facet=model`;
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return { status: 'error', items_found: 0, items_new: 0, error: `SoundCloud auth failed (HTTP ${res.status}) — set SOUNDCLOUD_CLIENT_ID` };
        }
        throw new Error(`SoundCloud HTTP ${res.status}`);
      }
      const data = (await res.json()) as { collection?: ScUser[] };
      for (const user of data.collection ?? []) {
        if (seen.has(user.permalink)) continue;
        seen.add(user.permalink);
        const text = `${user.username} ${user.description ?? ''} ${user.city ?? ''}`.toLowerCase();
        if (!text.includes('wellington')) continue;
        found += 1;
        const id = `soundcloud-${user.permalink}`;
        const result = await pool.query(
          `INSERT INTO djs (id, name, bio, soundcloud_url, image_url, source, data_completeness)
           VALUES ($1, $2, $3, $4, $5, 'soundcloud', 20)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [id, user.username, user.description ?? null, `https://soundcloud.com/${user.permalink}`, user.avatar_url ?? null],
        );
        if (result.rows.length > 0) newCount += 1;
      }
      await sleep(700);
    }
    return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: newCount, error: found === 0 ? 'No Wellington users found' : undefined };
  },
};
