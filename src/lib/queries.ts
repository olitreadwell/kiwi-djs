import 'server-only';
import { getPool } from './db';
import snapshot from '@/data/snapshot.json';

export const isDbMode = Boolean(process.env.DATABASE_URL);

const completenessSql = `(
  (CASE WHEN name IS NOT NULL THEN 10 ELSE 0 END) +
  (CASE WHEN bio IS NOT NULL THEN 15 ELSE 0 END) +
  (CASE WHEN cardinality(genres) > 0 THEN 15 ELSE 0 END) +
  (CASE WHEN image_url IS NOT NULL THEN 15 ELSE 0 END) +
  (CASE WHEN soundcloud_url IS NOT NULL THEN 10 ELSE 0 END) +
  (CASE WHEN instagram_url IS NOT NULL THEN 10 ELSE 0 END) +
  (CASE WHEN facebook_url IS NOT NULL THEN 10 ELSE 0 END) +
  (CASE WHEN website_url IS NOT NULL THEN 10 ELSE 0 END) +
  (CASE WHEN mixcloud_url IS NOT NULL THEN 5 ELSE 0 END)
)`;

export interface DjRow {
  id: string;
  name: string;
  bio: string | null;
  genres: string[];
  image_url: string | null;
  soundcloud_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  mixcloud_url: string | null;
  website_url: string | null;
  active: boolean;
  popularity: number;
  data_completeness: number;
  source: string;
  upcoming_events: number;
}

export interface EventRow {
  id: string;
  name: string;
  venue: string | null;
  starts_at: string;
  url: string | null;
  source: string;
  dj_id: string | null;
  dj_name: string | null;
}

export async function listDjs(opts: { query?: string; genre?: string } = {}): Promise<DjRow[]> {
  if (!isDbMode) {
    let rows = snapshot.djs as DjRow[];
    if (opts.query) {
      const q = opts.query.toLowerCase();
      rows = rows.filter((dj) => `${dj.name} ${dj.bio ?? ''} ${dj.genres.join(' ')}`.toLowerCase().includes(q));
    }
    if (opts.genre) rows = rows.filter((dj) => dj.genres.includes(opts.genre!));
    return rows.sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));
  }
  const pool = getPool();
  const params: unknown[] = [];
  const where: string[] = ['opt_out = FALSE'];
  if (opts.query) {
    params.push(`%${opts.query}%`);
    where.push(`(name ILIKE $${params.length} OR bio ILIKE $${params.length} OR array_to_string(genres, ' ') ILIKE $${params.length})`);
  }
  if (opts.genre) {
    params.push(opts.genre);
    where.push(`$${params.length} = ANY(genres)`);
  }
  const result = await pool.query(
    `SELECT d.*, ${completenessSql} AS data_completeness,
            (SELECT count(*) FROM events e WHERE e.dj_id = d.id AND e.starts_at > now()) AS upcoming_events
     FROM djs d
     WHERE ${where.join(' AND ')}
     ORDER BY popularity DESC, name ASC`,
    params,
  );
  return result.rows as DjRow[];
}

export async function getDjById(id: string): Promise<DjRow | null> {
  if (!isDbMode) {
    return (snapshot.djs as DjRow[]).find((dj) => dj.id === id) ?? null;
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT d.*, ${completenessSql} AS data_completeness,
            (SELECT count(*) FROM events e WHERE e.dj_id = d.id AND e.starts_at > now()) AS upcoming_events
     FROM djs d WHERE d.id = $1 AND d.opt_out = FALSE`,
    [id],
  );
  return (result.rows[0] as DjRow) ?? null;
}

export async function getUpcomingEvents(limit = 60): Promise<EventRow[]> {
  if (!isDbMode) {
    const now = Date.now();
    return (snapshot.events as EventRow[])
      .filter((event) => event.starts_at && new Date(event.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, limit);
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id
     WHERE e.starts_at > now()
     ORDER BY e.starts_at ASC
     LIMIT $1`,
    [limit],
  );
  return result.rows as EventRow[];
}

export async function getGenres(): Promise<string[]> {
  if (!isDbMode) {
    return [...new Set((snapshot.djs as DjRow[]).flatMap((dj) => dj.genres))].sort();
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT DISTINCT unnest(genres) AS genre FROM djs WHERE opt_out = FALSE ORDER BY genre`,
  );
  return result.rows.map((row) => row.genre as string);
}

export async function getPopularDjs(limit = 8): Promise<DjRow[]> {
  if (!isDbMode) {
    return (snapshot.djs as DjRow[])
      .filter((dj) => dj.active)
      .sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name))
      .slice(0, limit);
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT d.*, ${completenessSql} AS data_completeness,
            (SELECT count(*) FROM events e WHERE e.dj_id = d.id AND e.starts_at > now()) AS upcoming_events
     FROM djs d
     WHERE d.opt_out = FALSE AND d.active = TRUE
     ORDER BY d.popularity DESC, d.name ASC
     LIMIT $1`,
    [limit],
  );
  return result.rows as DjRow[];
}

export async function getDjGigs(djId: string, limit = 20): Promise<EventRow[]> {
  if (!isDbMode) {
    const now = Date.now();
    return (snapshot.events as EventRow[])
      .filter((event) => event.dj_id === djId && event.starts_at && new Date(event.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, limit);
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id
     WHERE e.dj_id = $1 AND e.starts_at > now()
     ORDER BY e.starts_at ASC LIMIT $2`,
    [djId, limit],
  );
  return result.rows as EventRow[];
}
