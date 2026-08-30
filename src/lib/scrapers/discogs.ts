// Discogs discography enrichment (#68): for DJs that already have a Discogs
// artist link, pull their release list (title/year/label/format) into
// dj_releases. Runs only when DISCOGS_TOKEN is set; otherwise errors
// cleanly so the loop surfaces the credential gap.
import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { sleep } from './http';
import type { ScrapeResult } from './types';

const API = 'https://api.discogs.com';

interface DiscogsRelease {
  id: number;
  title: string;
  year?: number;
  label?: string;
  format?: string;
  resource_url?: string;
}

function artistIdFromUrl(url: string): string | null {
  const match = url.match(/discogs\.com\/artist\/(\d+)/i);
  return match?.[1] ?? null;
}

export async function enrichDiscogsReleases(pool: Pool): Promise<ScrapeResult> {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) {
    return { status: 'error', items_found: 0, items_new: 0, error: 'no Discogs credentials (set DISCOGS_TOKEN)' };
  }
  const djs = await pool.query(
    `SELECT d.id, d.name, l.url
     FROM djs d JOIN dj_links l ON l.dj_id = d.id AND l.type = 'discogs'
     WHERE d.active = TRUE AND d.opt_out = FALSE
       AND NOT EXISTS (SELECT 1 FROM dj_releases r WHERE r.dj_id = d.id)
     ORDER BY d.popularity DESC
     LIMIT 10`,
  );
  let found = 0;
  let newCount = 0;
  for (const row of djs.rows) {
    const djId = row.id as string;
    const artistId = artistIdFromUrl(row.url as string);
    if (!artistId) continue;
    try {
      const res = await fetch(`${API}/artists/${artistId}/releases?per_page=50&sort=year&sort_order=desc`, {
        headers: { authorization: `Discogs token=${token}`, 'user-agent': 'KiwiDJs/1.0 +https://nz-djs.vercel.app' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.log(`  enrich-discogs: ${row.name} → HTTP ${res.status}`);
        await sleep(1000);
        continue;
      }
      const body = (await res.json()) as { releases?: DiscogsRelease[] };
      for (const release of body.releases ?? []) {
        if (!release.title) continue;
        const id = `${djId}-${createHash('sha1').update(`${release.title}-${release.year ?? ''}`).digest('hex').slice(0, 12)}`;
        const inserted = await pool.query(
          `INSERT INTO dj_releases (id, dj_id, title, year, label, format, url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING RETURNING id`,
          [id, djId, release.title, release.year ?? null, release.label ?? null, release.format ?? null, release.resource_url ?? null],
        );
        if (inserted.rows.length > 0) newCount += 1;
        found += 1;
      }
    } catch (err) {
      console.log(`  enrich-discogs: ${row.name} → error (${err instanceof Error ? err.message : String(err)})`);
    }
    await sleep(1000);
  }
  return {
    status: found > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: newCount,
    error: found === 0 ? 'No Discogs releases found' : undefined,
  };
}
