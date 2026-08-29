import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { fetchHtml, sleep } from './http';
import { getSoundcloudClientId } from './soundcloud-client';
import { enrichItunes, enrichMusicbrainz } from './apis';
import { upsertDjLink } from './links';
import { isGenreTag, normaliseGenres } from '../genres';
export { upsertDjLink };
import type { ScrapeResult } from './types';

interface DjRow {
  id: string;
  name: string;
}

export async function upsertDjArticle(
  pool: Pool,
  djId: string,
  article: { title: string; url: string; source?: string; publishedAt?: Date | null; snippet?: string },
): Promise<void> {
  // Dedupe by title per DJ (#37): Bing RSS returns the same article under
  // different URLs across queries/runs.
  const existing = await pool.query(`SELECT 1 FROM dj_articles WHERE dj_id = $1 AND lower(title) = lower($2) LIMIT 1`, [djId, article.title]);
  if (existing.rows.length > 0) return;
  const id = `${djId}-${createHash('sha1').update(article.url).digest('hex').slice(0, 16)}`;
  await pool.query(
    `INSERT INTO dj_articles (id, dj_id, title, url, source, published_at, snippet) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [id, djId, article.title, article.url, article.source ?? null, article.publishedAt ?? null, article.snippet ?? null],
  );
}

export type MixKind = 'mix' | 'interview';

// Interviews, podcasts and talk segments are not mixes (#55). Profile plays
// and stations have no real audio and are not valuable (#56).
const INTERVIEW_PATTERN = /\b(interview|podcast|chat|talks? with|conversation|q&a|q\.?a\.?)\b/i;

export function classifyMixTitle(title: string): MixKind {
  return INTERVIEW_PATTERN.test(title) ? 'interview' : 'mix';
}

export async function upsertDjMix(
  pool: Pool,
  djId: string,
  platform: 'soundcloud' | 'mixcloud',
  title: string,
  url: string,
  kind: MixKind = 'mix',
): Promise<void> {
  const id = `${djId}-${platform}-${createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
  await pool.query(
    `INSERT INTO dj_mixes (id, dj_id, platform, title, url, kind) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [id, djId, platform, title, url, kind],
  );
}

interface MixcloudResult {
  name: string;
  url: string;
  user?: { name: string; url: string };
  created_time?: string;
  audio_length?: number;
}

export async function enrichMixcloud(pool: Pool, dj: DjRow): Promise<ScrapeResult> {
  const queries = [dj.name, `${dj.name} mix`];
  let found = 0;
  for (const query of queries) {
    const url = `https://api.mixcloud.com/search/?q=${encodeURIComponent(query)}&type=cloudcast`;
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '60');
      await pool.query(`UPDATE djs SET mixcloud_backoff_until = now() + make_interval(secs => $2) WHERE id = $1`, [
        dj.id,
        Number.isFinite(retryAfter) ? retryAfter : 60,
      ]);
      throw new Error(`Mixcloud rate-limited (HTTP 429) — backoff until ${new Date(Date.now() + retryAfter * 1000).toISOString()}`);
    }
    if (!res.ok) throw new Error(`Mixcloud HTTP ${res.status}`);
    const data = (await res.json()) as { data?: MixcloudResult[] };
    for (const item of data.data ?? []) {
      const owner = item.user?.name ?? '';
      // Only the artist's own Mixcloud account counts (#25). Item-name
      // matches from other accounts (radio shows, interviews) are excluded.
      if (!owner.toLowerCase().includes(dj.name.toLowerCase())) continue;
      // Profile plays / stations have no real audio — not valuable (#56).
      if (!item.audio_length || item.audio_length < 60) continue;
      found += 1;
      await upsertDjMix(pool, dj.id, 'mixcloud', item.name, item.url, classifyMixTitle(item.name));
      if (item.user?.url) {
        await upsertDjLink(pool, dj.id, 'mixcloud', item.user.url, `Mixcloud: ${item.user.name}`);
      }
    }
    await sleep(500);
  }
  return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: 0, error: found === 0 ? 'No Mixcloud matches' : undefined };
}

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
}

export async function enrichNews(pool: Pool, dj: DjRow): Promise<ScrapeResult> {
  const queries = [`"${dj.name}" wellington`, `"${dj.name}"`];
  let found = 0;
  const seenTitles = new Set<string>();
  for (const query of queries) {
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
    const xml = await fetchHtml(url);
    await sleep(500);
    const items = parseBingNewsXml(xml);
    if (items.length === 0) continue;
    for (const item of items) {
      const titleKey = `${item.source}|${item.title}`.toLowerCase();
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);
      await upsertDjArticle(pool, dj.id, {
        title: item.title,
        url: item.link,
        source: item.source,
        publishedAt: item.pubDate ? new Date(item.pubDate) : null,
        snippet: item.description.replace(/<[^>]+>/g, '').slice(0, 300),
      });
      found += 1;
    }
    if (found > 0) break;
  }
  return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: 0, error: found === 0 ? 'No news matches' : undefined };
}

export function parseBingNewsXml(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = decodeHtmlEntities(block.match(/<title>(.*?)<\/title>/)?.[1] ?? '');
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
    const source = block.match(/<News:Source[^>]*>(.*?)<\/News:Source>/)?.[1] ?? block.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? '';
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
    const description = decodeHtmlEntities(block.match(/<description>(.*?)<\/description>/)?.[1] ?? '');
    if (title && link) items.push({ title, link, source, pubDate, description });
  }
  return items;
}

// Decode HTML entities (&#232; → è, &amp; → &, ...) in RSS titles/snippets.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ugrave: 'ù',
  oacute: 'ó',
  aacute: 'á',
  iacute: 'í',
  uacute: 'ú',
  ntilde: 'ñ',
  ccedil: 'ç',
  szlig: 'ß',
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, code: string) => {
    if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return NAMED_ENTITIES[code] ?? entity;
  });
}

export async function enrichSoundcloud(pool: Pool, dj: DjRow): Promise<ScrapeResult> {
  const clientId = await getSoundcloudClientId();
  if (!clientId) {
    return { status: 'partial', items_found: 0, items_new: 0, error: 'no valid SoundCloud client id' };
  }
  const url = `https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(dj.name)}&client_id=${clientId}&limit=5`;
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`SoundCloud HTTP ${res.status}`);
  const data = (await res.json()) as {
    collection?: Array<{ id: number; permalink: string; username: string; avatar_url?: string }>;
  };
  let found = 0;
  for (const user of data.collection ?? []) {
    if (!user.username.toLowerCase().includes(dj.name.toLowerCase())) continue;
    found += 1;
    await upsertDjLink(pool, dj.id, 'soundcloud', `https://soundcloud.com/${user.permalink}`, `SoundCloud: ${user.username}`);
    await pool.query(`UPDATE djs SET soundcloud_url = $1, image_url = COALESCE(image_url, $2) WHERE id = $3`, [
      `https://soundcloud.com/${user.permalink}`,
      user.avatar_url ?? null,
      dj.id,
    ]);
    // Pull the artist's own tracks: aggregate genre tags (#33) and add
    // tracks as mixes. Only the artist's own uploads count (#25).
    const tracksUrl = `https://api-v2.soundcloud.com/users/${user.id}/tracks?client_id=${clientId}&limit=50`;
    const tracksRes = await fetch(tracksUrl, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (tracksRes.ok) {
      const tracks = (await tracksRes.json()) as {
        collection?: Array<{ permalink_url: string; title: string; genre?: string; tag_list?: string; duration?: number; bpm?: number }>;
      };
      const genres = new Set<string>();
      const bpms: number[] = [];
      for (const track of tracks.collection ?? []) {
        if (!track.permalink_url || !track.title) continue;
        if (track.genre && isGenreTag(track.genre)) genres.add(track.genre);
        for (const tag of (track.tag_list ?? '').split(/\s+/)) {
          const clean = tag.replace(/^"|"$/g, '');
          if (clean && isGenreTag(clean)) genres.add(clean);
        }
        if (track.duration && track.duration >= 60_000) {
          await upsertDjMix(pool, dj.id, 'soundcloud', track.title, track.permalink_url, classifyMixTitle(track.title));
        }
        if (track.bpm && track.bpm >= 60 && track.bpm <= 200) bpms.push(track.bpm);
      }
      if (genres.size > 0) {
        const normalised = normaliseGenres([...genres]);
        await pool.query(
          `UPDATE djs SET genres = (SELECT array_agg(g) FROM (SELECT DISTINCT g FROM unnest(genres || $2::text[]) AS g LIMIT 8) t) WHERE id = $1`,
          [dj.id, normalised],
        );
      }
      if (bpms.length >= 3) {
        const sorted = [...bpms].sort((a, b) => a - b);
        const low = sorted[Math.floor(sorted.length * 0.1)];
        const high = sorted[Math.floor(sorted.length * 0.9)];
        await pool.query(`UPDATE djs SET bpm_range = $2 WHERE id = $1`, [dj.id, `${low}-${high}`]);
      }
    }
    await sleep(500);
  }
  return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: 0, error: found === 0 ? 'No SoundCloud match' : undefined };
}

export async function soundcloudPreflight(): Promise<ScrapeResult | null> {
  const clientId = await getSoundcloudClientId();
  if (!clientId) {
    return { status: 'error', items_found: 0, items_new: 0, error: 'SoundCloud auth failed — no valid client id (set SOUNDCLOUD_CLIENT_ID)' };
  }
  const url = `https://api-v2.soundcloud.com/search/users?q=wellington&client_id=${clientId}&limit=1`;
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    return { status: 'error', items_found: 0, items_new: 0, error: `SoundCloud auth failed (HTTP ${res.status}) — set a fresh SOUNDCLOUD_CLIENT_ID` };
  }
  return null;
}

export async function enrichAllDjs(pool: Pool): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  // Enrich active DJs first, then the most promising candidates (highest
  // verification evidence) so discovery candidates can accumulate mixes,
  // links and articles — the evidence that promotes them to active.
  const topDjs = (): Promise<{ rows: DjRow[] }> =>
    pool.query(
      `SELECT id, name FROM djs
       WHERE opt_out = FALSE AND is_nz = TRUE
         AND (discovery_note IS NULL OR discovery_note <> 'junk')
       ORDER BY active DESC, popularity DESC, verification_level DESC, data_completeness DESC
       LIMIT 15`,
    );
  const mixcloudDjs = (): Promise<{ rows: DjRow[] }> =>
    pool.query(
      `SELECT id, name FROM djs
       WHERE opt_out = FALSE AND is_nz = TRUE
         AND (discovery_note IS NULL OR discovery_note <> 'junk')
         AND (mixcloud_backoff_until IS NULL OR mixcloud_backoff_until <= now())
       ORDER BY active DESC, popularity DESC, verification_level DESC, data_completeness DESC
       LIMIT 15`,
    );
  const sources: Array<{
    source: string;
    getDjs: () => Promise<{ rows: DjRow[] }>;
    preflight?: () => Promise<ScrapeResult | null>;
    run: (pool: Pool, dj: DjRow) => Promise<ScrapeResult>;
  }> = [
    { source: 'enrich-mixcloud', getDjs: mixcloudDjs, run: enrichMixcloud },
    { source: 'enrich-news', getDjs: topDjs, run: enrichNews },
    { source: 'enrich-soundcloud', getDjs: topDjs, preflight: soundcloudPreflight, run: enrichSoundcloud },
    { source: 'enrich-musicbrainz', getDjs: topDjs, run: enrichMusicbrainz },
    { source: 'enrich-itunes', getDjs: topDjs, run: enrichItunes },
  ];
  for (const source of sources) {
    if (source.preflight) {
      const preflight = await source.preflight();
      if (preflight) {
        await pool.query(
          `INSERT INTO scrapes (source, status, items_found, items_new, error, started_at, finished_at) VALUES ($1, $2, $3, 0, $4, now(), now())`,
          [source.source, preflight.status, preflight.items_found, preflight.error ?? null],
        );
        results.push(preflight);
        continue;
      }
    }
    const djs = (await source.getDjs()).rows;
    let found = 0;
    let errors = 0;
    let rateLimited = 0;
    for (const dj of djs) {
      try {
        const result = await source.run(pool, dj);
        found += result.items_found;
        if (result.status === 'error') errors += 1;
        console.log(`  ${source.source}: ${dj.name} → ${result.status}${result.error ? ` (${result.error})` : ''}`);
      } catch (err) {
        errors += 1;
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('429')) rateLimited += 1;
        console.log(`  ${source.source}: ${dj.name} → error (${message})`);
      }
      await sleep(300);
    }
    const djCount = djs.length;
    const result: ScrapeResult = {
      source: source.source,
      status: djCount === 0 ? 'partial' : errors === djCount ? 'error' : found > 0 ? 'ok' : 'partial',
      items_found: found,
      items_new: 0,
      error: djCount === 0 ? 'No DJs eligible (all rate-limited?)' : errors > 0 ? `${errors}/${djCount} DJs errored${rateLimited > 0 ? `, ${rateLimited} rate-limited` : ''}` : undefined,
    };
    await pool.query(
      `INSERT INTO scrapes (source, status, items_found, items_new, error, started_at, finished_at) VALUES ($1, $2, $3, 0, $4, now(), now())`,
      [source.source, result.status, result.items_found, result.error ?? null],
    );
    results.push(result);
  }
  return results;
}
