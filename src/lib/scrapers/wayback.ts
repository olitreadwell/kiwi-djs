// Wayback Machine archiving (#302): keep a permanent copy of the external
// links we surface (articles, event ticket pages, DJ profiles) so a dead
// source link never loses the record. The availability API is cheap; the
// save endpoint is slow and rate-limited, so the loop archives a small
// batch per cycle (ARCHIVE_LIMIT, default 10), most-likely-to-die first.
import type { Pool } from 'pg';
import { sleep } from './http';

const WB_UA = 'KiwiDJsBot/1.0 (https://github.com/olitreadwell/kiwi-djs; link archiving)';

interface WaybackAvailable {
  archived_snapshots?: { closest?: { url?: string } };
}

export async function waybackAvailable(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {
      headers: { 'user-agent': WB_UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as WaybackAvailable;
    return data.archived_snapshots?.closest?.url ?? null;
  } catch {
    return null;
  }
}

// Save a page. The save endpoint blocks until the capture finishes (can
// take 30-90s), so use a long timeout and never run this in parallel.
export async function saveToWayback(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://web.archive.org/save/${url}`, {
      headers: { 'user-agent': WB_UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    return `https://web.archive.org/web/${url}`;
  } catch {
    return null;
  }
}

interface ArchiveTarget {
  table: 'dj_articles' | 'events' | 'dj_links';
  id: string;
  url: string;
}

// Pick links missing an archive copy, most likely to die first: news
// articles, then event ticket pages, then DJ profile links.
async function pickTargets(pool: Pool, limit: number): Promise<ArchiveTarget[]> {
  const targets: ArchiveTarget[] = [];
  const articles = (
    await pool.query(
      `SELECT id, url FROM dj_articles WHERE archive_url IS NULL AND url IS NOT NULL ORDER BY published_at DESC NULLS LAST LIMIT $1`,
      [limit],
    )
  ).rows as Array<{ id: string; url: string }>;
  for (const row of articles) targets.push({ table: 'dj_articles', id: row.id, url: row.url });
  if (targets.length >= limit) return targets;
  const events = (
    await pool.query(
      `SELECT id, url FROM events WHERE archive_url IS NULL AND url IS NOT NULL AND starts_at <= now() ORDER BY starts_at DESC LIMIT $1`,
      [limit - targets.length],
    )
  ).rows as Array<{ id: string; url: string }>;
  for (const row of events) targets.push({ table: 'events', id: row.id, url: row.url });
  if (targets.length >= limit) return targets;
  const links = (
    await pool.query(
      `SELECT id, url FROM dj_links WHERE archive_url IS NULL AND type IN ('soundcloud', 'mixcloud', 'spotify', 'website', 'bandcamp', 'beatport') LIMIT $1`,
      [limit - targets.length],
    )
  ).rows as Array<{ id: string; url: string }>;
  for (const row of links) targets.push({ table: 'dj_links', id: row.id, url: row.url });
  return targets;
}

export async function archiveMissingLinks(pool: Pool, limit = 10): Promise<number> {
  const targets = await pickTargets(pool, limit);
  let archived = 0;
  for (const target of targets) {
    const existing = await waybackAvailable(target.url);
    const archiveUrl = existing ?? (await saveToWayback(target.url));
    if (archiveUrl) {
      await pool.query(`UPDATE ${target.table} SET archive_url = $2 WHERE id = $1`, [target.id, archiveUrl]);
      archived += 1;
    }
    await sleep(1000);
  }
  return archived;
}
