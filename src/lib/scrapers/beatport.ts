import type { Pool } from 'pg';
import { normaliseGenres } from '../genres';
import { sleep } from './http';
import type { ScrapeResult } from './types';

interface DjRow {
  id: string;
  name: string;
}

// Beatport blocks direct fetches (Cloudflare), so the artist's tracks page
// is rendered through the Jina reader. The page's genre filter lists every
// genre with a track count — e.g. "Organic House (39)" — which is far more
// specific than the umbrella genres other sources give us.
const JINA_READER = 'https://r.jina.ai/';

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export async function enrichBeatport(pool: Pool, dj: DjRow): Promise<ScrapeResult> {
  const link = await pool.query(`SELECT url FROM dj_links WHERE dj_id = $1 AND type = 'beatport' LIMIT 1`, [dj.id]);
  const url = link.rows[0]?.url as string | undefined;
  if (!url) return { status: 'partial', items_found: 0, items_new: 0, error: 'No Beatport link' };

  let text: string;
  try {
    const res = await fetch(`${JINA_READER}${url}/tracks`, {
      headers: {
        accept: 'text/plain',
        ...(process.env.JINA_API_KEY ? { authorization: `Bearer ${process.env.JINA_API_KEY}` } : {}),
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { status: 'error', items_found: 0, items_new: 0, error: `Beatport HTTP ${res.status}` };
    text = await res.text();
  } catch (err) {
    return { status: 'error', items_found: 0, items_new: 0, error: err instanceof Error ? err.message : String(err) };
  }
  await sleep(500);

  const navGenres = new Set(
    [...text.matchAll(/\[([A-Za-z0-9 &/]+)\]\(https:\/\/www\.beatport\.com\/genre\//g)].map((match) => norm(match[1])),
  );
  const counts = new Map<string, number>();
  for (const match of text.matchAll(/-\s*\[[ x]\]\s*([A-Za-z0-9 &/]+)\((\d+)\)/g)) {
    const name = match[1].trim();
    if (navGenres.has(norm(name))) counts.set(name, (counts.get(name) ?? 0) + Number(match[2]));
  }
  if (counts.size === 0) return { status: 'partial', items_found: 0, items_new: 0, error: 'No genre filters found' };

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const normalised = normaliseGenres(sorted);
  const row = await pool.query('SELECT genres FROM djs WHERE id = $1', [dj.id]);
  const existing = (row.rows[0]?.genres ?? []) as string[];
  const merged = [...normalised, ...existing.filter((genre) => !normalised.includes(genre))].slice(0, 8);
  await pool.query('UPDATE djs SET genres = $2 WHERE id = $1', [dj.id, merged]);
  return { status: 'ok', items_found: counts.size, items_new: 0 };
}
