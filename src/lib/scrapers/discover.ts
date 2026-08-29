import type { Pool } from 'pg';
import { slugify } from '../slug';
import { sleep } from './http';
import { upsertDjLink } from './enrich';
import type { ScrapeResult } from './types';

const STOP_WORDS = new Set([
  'album', 'release', 'tour', 'live', 'party', 'night', 'presents', 'present', 'with', 'and', 'wellington',
  'new', 'zealand', 'nz', 'special', 'guest', 'support', 'ep', 'single', 'debut', 'final', 'show', 'gig',
  'san', 'fran', 'meow', 'valhalla', 'caroline', 'ivy', 'bar', 'sly', 'deadpool', 'third', 'eye', 'rogue',
  'vagabond', 'moon', 'corner', 'store', 'big', 'fan', 'the', 'of', 'for', 'at', 'in', 'on', 'feat', 'ft',
  'festival', 'quiz', 'tribute', 'fundraiser', 'showcase', 'drag', 'concert', 'opera', 'house', 'embassy',
  'hunter', 'lounge', 'grand', 'laundry', 'old', 'bailey', 'mishmash', 'brewtown', 'green', 'room', 'backyard',
  'thistle', 'wunderbar', 'hotel', 'club', 'tavern', 'hall', 'theatre', 'theater', 'stadium', 'arena',
  'racket', 'malt', 'voices', 'perform', 'music', 'siouxsie', 'banshees', 'anniversary', 'celebration',
]);

const JUNK_NAMES = new Set([
  'dj', 'djs', 'dj set', 'dj sets', 'support', 'opening', 'closing', 'live', 'live set', 'live band',
  'band', 'bands', 'mc', 'host', 'hosts', 'resident', 'residents', 'guest', 'guests', 'special guest',
  'headline', 'headliner', 'opener', 'closer', 'warm up', 'warmup', 'tbc', 'tba', 'to be announced',
  'to be confirmed', 'various artists', 'all night long', 'all night', 'late night', 'early bird',
]);

export function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isJunkName(name: string): boolean {
  const normalized = normalizeArtistName(name);
  if (JUNK_NAMES.has(normalized)) return true;
  return [...JUNK_NAMES].some((junk) => normalized === junk || normalized.startsWith(`${junk} `) || normalized.endsWith(` ${junk}`));
}

export function extractArtistNames(eventName: string): string[] {
  const cleaned = eventName
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(presents|presented by|w\/|with|feat\.?|ft\.?)\b/gi, ' | ')
    .replace(/[|,;&/]+/g, ' | ')
    .replace(/\s+[-–—]\s+/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = cleaned.split('|').map((part) => part.trim()).filter(Boolean);
  const names: string[] = [];
  for (const part of parts) {
    const words = part
      .replace(/^[:.\-–—]+/, '')
      .replace(/[:.\-–—]+$/, '')
      .split(' ')
      .filter((word) => !STOP_WORDS.has(word.toLowerCase()));
    if (words.length === 0) continue;
    const name = words.join(' ');
    if (name.length < 3 || name.length > 60) continue;
    if (/\d{4}/.test(name)) continue;
    if (/^\d/.test(name)) continue;
    if (/^(a|an|the|and|of|for|at|in|on)$/i.test(words[words.length - 1])) continue;
    if (words.length === 1 && name.length < 4) continue;
    names.push(name);
  }
  return names;
}

export async function discoverFromEvents(pool: Pool): Promise<ScrapeResult> {
  const events = (await pool.query('SELECT id, name FROM events WHERE dj_id IS NULL')).rows as Array<{ id: string; name: string }>;
  const existing = await loadExistingNames(pool);
  const venueNames = new Set(
    (await pool.query('SELECT name FROM venues')).rows.map((row) => normalizeArtistName(row.name as string)),
  );
  let found = 0;
  let newCount = 0;
  for (const event of events) {
    const names = extractArtistNames(event.name);
    const coBilled = names.length > 1;
    for (const name of names) {
      const key = normalizeArtistName(name);
      if (existing.has(key)) continue;
      if (!coBilled && name.split(' ').length === 1) continue;
      existing.add(key);
      const junk = isJunkName(name) || venueNames.has(key);
      const id = slugify(name);
      const result = await pool.query(
        `INSERT INTO djs (id, name, source, data_completeness, active, discovery_note) VALUES ($1, $2, 'discovered', 10, FALSE, $3)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, name, junk ? 'junk' : null],
      );
      if (result.rows.length > 0) {
        newCount += 1;
        await pool.query(`INSERT INTO dj_aliases (dj_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, key]);
        if (junk) console.log(`  discover-events: junk candidate skipped from promotion: ${name}`);
      }
      found += 1;
    }
  }
  return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: newCount, error: found === 0 ? 'No new names' : undefined };
}

async function loadExistingNames(pool: Pool): Promise<Set<string>> {
  const names = (await pool.query('SELECT lower(name) AS name FROM djs')).rows.map((row) => row.name as string);
  const aliases = (await pool.query('SELECT alias FROM dj_aliases')).rows.map((row) => row.alias as string);
  return new Set([...names, ...aliases].map(normalizeArtistName));
}

interface MixcloudUser {
  name: string;
  url: string;
  city?: string;
}

export async function discoverFromMixcloud(pool: Pool): Promise<ScrapeResult> {
  const queries = ['wellington dj', 'wellington djs', 'wellington techno', 'wellington house'];
  const existing = await loadExistingNames(pool);
  let found = 0;
  let newCount = 0;
  for (const query of queries) {
    const url = `https://api.mixcloud.com/search/?q=${encodeURIComponent(query)}&type=user`;
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) continue;
    const data = (await res.json()) as { data?: MixcloudUser[] };
    for (const user of data.data ?? []) {
      const text = `${user.name} ${user.city ?? ''}`.toLowerCase();
      if (!text.includes('wellington')) continue;
      const key = normalizeArtistName(user.name);
      if (existing.has(key)) continue;
      existing.add(key);
      const junk = isJunkName(user.name);
      const id = slugify(user.name);
      const result = await pool.query(
        `INSERT INTO djs (id, name, source, data_completeness, active, discovery_note) VALUES ($1, $2, 'mixcloud', 15, FALSE, $3)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, user.name, junk ? 'junk' : null],
      );
      if (result.rows.length > 0) {
        newCount += 1;
        await upsertDjLink(pool, id, 'mixcloud', user.url, `Mixcloud: ${user.name}`);
        if (junk) console.log(`  discover-mixcloud: junk candidate skipped from promotion: ${user.name}`);
      }
      found += 1;
    }
    await sleep(500);
  }
  return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: newCount, error: found === 0 ? 'No Wellington users' : undefined };
}

export async function verifyDiscovered(pool: Pool): Promise<ScrapeResult> {
  const result = await pool.query(
    `UPDATE djs SET active = TRUE, updated_at = now()
     WHERE source IN ('discovered', 'mixcloud') AND active = FALSE AND opt_out = FALSE
       AND (discovery_note IS NULL OR discovery_note <> 'junk')
       AND (
         EXISTS (SELECT 1 FROM dj_mixes m WHERE m.dj_id = djs.id) OR
         EXISTS (SELECT 1 FROM dj_links l WHERE l.dj_id = djs.id) OR
         EXISTS (SELECT 1 FROM dj_articles a WHERE a.dj_id = djs.id)
       )
     RETURNING id`,
  );
  return { status: 'ok', items_found: result.rows.length, items_new: result.rows.length };
}

export async function discoverAll(pool: Pool): Promise<ScrapeResult[]> {
  const runners: Array<{ source: string; run: (pool: Pool) => Promise<ScrapeResult> }> = [
    { source: 'discover-events', run: discoverFromEvents },
    { source: 'discover-mixcloud', run: discoverFromMixcloud },
    { source: 'verify-discovered', run: verifyDiscovered },
  ];
  const results: ScrapeResult[] = [];
  for (const runner of runners) {
    let result: ScrapeResult;
    try {
      result = await runner.run(pool);
    } catch (err) {
      result = { status: 'error', items_found: 0, items_new: 0, error: err instanceof Error ? err.message : String(err) };
    }
    await pool.query(
      `INSERT INTO scrapes (source, status, items_found, items_new, error, started_at, finished_at) VALUES ($1, $2, $3, $4, $5, now(), now())`,
      [runner.source, result.status, result.items_found, result.items_new, result.error ?? null],
    );
    results.push(result);
  }
  return results;
}
