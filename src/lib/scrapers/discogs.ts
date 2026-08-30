// Discogs discography enrichment (#68): for DJs that already have a Discogs
// artist link, pull their release list (title/year/label/format) into
// dj_releases. Supports both auth styles:
//  - OAuth 1.0 with DISCOGS_CONSUMER_KEY/SECRET + DISCOGS_ACCESS_TOKEN/SECRET
//    (the app credentials flow — run scripts/discogs-auth.ts once to obtain
//    the access token), and
//  - the simpler personal token (DISCOGS_TOKEN) as a fallback.
// Without credentials it errors cleanly so the loop surfaces the gap.
import type { Pool } from 'pg';
import { createHash, createHmac, randomBytes } from 'node:crypto';
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

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// Build an OAuth 1.0 Authorization header (HMAC-SHA1) for a Discogs request.
function oauthHeader(opts: {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  params?: Record<string, string>;
}): string {
  const params: Record<string, string> = {
    ...(opts.params ?? {}),
    oauth_consumer_key: opts.consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...(opts.token ? { oauth_token: opts.token } : {}),
  };
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
  const baseString = `${opts.method.toUpperCase()}&${percentEncode(opts.url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(opts.consumerSecret)}&${percentEncode(opts.tokenSecret ?? '')}`;
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');
  const headerParams: Record<string, string> = { ...params, oauth_signature: signature };
  return `OAuth ${Object.keys(headerParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`).join(', ')}`;
}

function artistIdFromUrl(url: string): string | null {
  const match = url.match(/discogs\.com\/artist\/(\d+)/i);
  return match?.[1] ?? null;
}

export async function enrichDiscogsReleases(pool: Pool): Promise<ScrapeResult> {
  const hasOauth1 = Boolean(process.env.DISCOGS_CONSUMER_KEY && process.env.DISCOGS_CONSUMER_SECRET && process.env.DISCOGS_ACCESS_TOKEN && process.env.DISCOGS_ACCESS_TOKEN_SECRET);
  const hasToken = Boolean(process.env.DISCOGS_TOKEN);
  if (!hasOauth1 && !hasToken) {
    return {
      status: 'error',
      items_found: 0,
      items_new: 0,
      error:
        'no Discogs credentials (set DISCOGS_CONSUMER_KEY/SECRET + DISCOGS_ACCESS_TOKEN/SECRET via scripts/discogs-auth.ts, or DISCOGS_TOKEN)',
    };
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
      const url = `${API}/artists/${artistId}/releases?per_page=50&sort=year&sort_order=desc`;
      const authorization = hasOauth1
        ? oauthHeader({
            method: 'GET',
            url,
            consumerKey: process.env.DISCOGS_CONSUMER_KEY!,
            consumerSecret: process.env.DISCOGS_CONSUMER_SECRET!,
            token: process.env.DISCOGS_ACCESS_TOKEN!,
            tokenSecret: process.env.DISCOGS_ACCESS_TOKEN_SECRET!,
          })
        : `Discogs token=${process.env.DISCOGS_TOKEN}`;
      const res = await fetch(url, {
        headers: { authorization, 'user-agent': 'KiwiDJs/1.0 +https://kiwi-djs.vercel.app' },
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
