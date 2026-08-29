import 'server-only';
import { getPool } from './db';
import snapshot from '@/data/snapshot.json';
import { extractArtistNames } from './scrapers/discover';

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
  verification_level: number;
  verification_sources: string[];
  source: string;
  is_nz: boolean;
  upcoming_events: number;
  last_played_at: string | null;
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

interface EventDjLink {
  event_id: string;
  dj_id: string;
}

export async function listDjs(opts: { query?: string; genre?: string } = {}): Promise<DjRow[]> {
  if (!isDbMode) {
    let rows = snapshot.djs as DjRow[];
    rows = rows.filter((dj) => dj.active === true);
    if (opts.query) {
      const q = opts.query.toLowerCase();
      rows = rows.filter((dj) => `${dj.name} ${dj.bio ?? ''} ${dj.genres.join(' ')}`.toLowerCase().includes(q));
    }
    if (opts.genre) rows = rows.filter((dj) => dj.genres.includes(opts.genre!));
    return rows.sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));
  }
  const pool = getPool();
  const params: unknown[] = [];
  const where: string[] = ['opt_out = FALSE AND active = TRUE AND is_nz = TRUE'];
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
            (SELECT count(*) FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = d.id AND e.starts_at > now()) AS upcoming_events,
            (SELECT max(e2.starts_at) FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS last_played_at
     FROM djs d
     WHERE ${where.join(' AND ')}
     ORDER BY popularity DESC, name ASC`,
    params,
  );
  return result.rows as DjRow[];
}

export async function getDjById(id: string): Promise<DjRow | null> {
  if (!isDbMode) {
    return (snapshot.djs as DjRow[]).find((dj) => dj.id === id && dj.active === true) ?? null;
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT d.*, ${completenessSql} AS data_completeness,
            (SELECT count(*) FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = d.id AND e.starts_at > now()) AS upcoming_events,
            (SELECT max(e2.starts_at) FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS last_played_at
     FROM djs d WHERE d.id = $1 AND d.opt_out = FALSE AND d.active = TRUE AND d.is_nz = TRUE`,
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

export async function getEvents(opts: { upcoming?: boolean; venue?: string; dj?: string; limit?: number } = {}): Promise<EventRow[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  if (!isDbMode) {
    let rows = snapshot.events as EventRow[];
    const now = Date.now();
    if (opts.upcoming !== false) rows = rows.filter((event) => event.starts_at && new Date(event.starts_at).getTime() > now);
    if (opts.venue) rows = rows.filter((event) => event.venue?.toLowerCase() === opts.venue!.toLowerCase());
    if (opts.dj) rows = rows.filter((event) => event.dj_id === opts.dj);
    return rows
      .sort((a, b) => (a.starts_at ? new Date(a.starts_at).getTime() : 0) - (b.starts_at ? new Date(b.starts_at).getTime() : 0))
      .slice(0, limit);
  }
  const pool = getPool();
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.upcoming !== false) {
    params.push(new Date().toISOString());
    where.push(`e.starts_at > $${params.length}`);
  }
  if (opts.venue) {
    params.push(opts.venue);
    where.push(`e.venue ILIKE $${params.length}`);
  }
  if (opts.dj) {
    params.push(opts.dj);
    where.push(`e.id IN (SELECT event_id FROM event_djs WHERE dj_id = $${params.length})`);
  }
  const result = await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id
     ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.starts_at ASC NULLS LAST
     LIMIT $${params.length + 1}`,
    [...params, limit],
  );
  return result.rows as EventRow[];
}

export async function getGenres(): Promise<string[]> {
  if (!isDbMode) {
    return [...new Set((snapshot.djs as DjRow[]).flatMap((dj) => dj.genres))].sort();
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT DISTINCT unnest(genres) AS genre FROM djs WHERE opt_out = FALSE AND active = TRUE ORDER BY genre`,
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
            (SELECT count(*) FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = d.id AND e.starts_at > now()) AS upcoming_events,
            (SELECT max(e2.starts_at) FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS last_played_at
     FROM djs d
     WHERE d.opt_out = FALSE AND d.active = TRUE AND d.is_nz = TRUE
     ORDER BY d.popularity DESC, d.name ASC
     LIMIT $1`,
    [limit],
  );
  return result.rows as DjRow[];
}

export async function getDjGigs(djId: string, limit = 20): Promise<EventRow[]> {
  if (!isDbMode) {
    const now = Date.now();
    const djEventIds = new Set(((snapshot.eventDjs ?? []) as EventDjLink[]).filter((link) => link.dj_id === djId).map((link) => link.event_id));
    return (snapshot.events as EventRow[])
      .filter((event) => djEventIds.has(event.id) && event.starts_at && new Date(event.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, limit);
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id
     WHERE e.id IN (SELECT event_id FROM event_djs WHERE dj_id = $1) AND e.starts_at > now()
     ORDER BY e.starts_at ASC LIMIT $2`,
    [djId, limit],
  );
  return result.rows as EventRow[];
}

export interface MixRow {
  id: string;
  dj_id: string;
  title: string;
  url: string;
  platform: string;
  kind: 'mix' | 'interview';
}

export interface ArticleRow {
  id: string;
  dj_id: string;
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  snippet: string | null;
}

export interface LinkRow {
  id: string;
  dj_id: string;
  type: string;
  url: string;
  label: string | null;
}

export interface CollabRow {
  name: string;
  dj_id: string | null;
  count: number;
}

export interface LabelRow {
  name: string;
  count: number;
}

export async function getDjMixes(djId: string): Promise<MixRow[]> {
  if (!isDbMode) return (snapshot.mixes as MixRow[] | undefined)?.filter((mix) => mix.dj_id === djId) ?? [];
  const pool = getPool();
  const result = await pool.query('SELECT id, title, url, platform, kind FROM dj_mixes WHERE dj_id = $1 ORDER BY created_at DESC', [djId]);
  return result.rows as MixRow[];
}

export async function getDjArticles(djId: string): Promise<ArticleRow[]> {
  if (!isDbMode) return (snapshot.articles as ArticleRow[] | undefined)?.filter((article) => article.dj_id === djId) ?? [];
  const pool = getPool();
  const result = await pool.query(
    'SELECT id, title, url, source, published_at, snippet FROM dj_articles WHERE dj_id = $1 ORDER BY published_at DESC NULLS LAST',
    [djId],
  );
  return result.rows as ArticleRow[];
}

export async function getDjLinks(djId: string): Promise<LinkRow[]> {
  if (!isDbMode) return (snapshot.links as LinkRow[] | undefined)?.filter((link) => link.dj_id === djId) ?? [];
  const pool = getPool();
  const result = await pool.query('SELECT id, type, url, label FROM dj_links WHERE dj_id = $1 ORDER BY type', [djId]);
  return result.rows as LinkRow[];
}

export async function getDjPastGigs(djId: string, limit = 20): Promise<EventRow[]> {
  if (!isDbMode) {
    const now = Date.now();
    const djEventIds = new Set(((snapshot.eventDjs ?? []) as EventDjLink[]).filter((link) => link.dj_id === djId).map((link) => link.event_id));
    return (snapshot.events as EventRow[])
      .filter((event) => djEventIds.has(event.id) && event.starts_at && new Date(event.starts_at).getTime() <= now)
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
      .slice(0, limit);
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id
     WHERE e.id IN (SELECT event_id FROM event_djs WHERE dj_id = $1) AND e.starts_at <= now()
     ORDER BY e.starts_at DESC LIMIT $2`,
    [djId, limit],
  );
  return result.rows as EventRow[];
}

export async function getDjCollabs(djId: string): Promise<CollabRow[]> {
  if (!isDbMode) {
    const dj = (snapshot.djs as DjRow[]).find((row) => row.id === djId);
    const djName = dj?.name.toLowerCase() ?? '';
    const counts = new Map<string, number>();
    for (const event of (snapshot.events as EventRow[]).filter((e) => e.dj_id === djId)) {
      for (const name of extractArtistNames(event.name)) {
        if (name.toLowerCase() === djName) continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    const knownByName = new Map((snapshot.djs as DjRow[]).map((row) => [row.name.toLowerCase(), row.id]));
    return [...counts.entries()]
      .map(([name, count]) => ({ name, dj_id: knownByName.get(name.toLowerCase()) ?? null, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }
  const pool = getPool();
  const dj = await pool.query('SELECT name FROM djs WHERE id = $1', [djId]);
  const djName = (dj.rows[0]?.name as string | undefined)?.toLowerCase() ?? '';
  const events = await pool.query('SELECT name FROM events WHERE dj_id = $1', [djId]);
  const counts = new Map<string, number>();
  for (const event of events.rows) {
    for (const name of extractArtistNames(event.name as string)) {
      if (name.toLowerCase() === djName) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const known = await pool.query('SELECT id, name FROM djs WHERE opt_out = FALSE AND active = TRUE');
  const knownByName = new Map(known.rows.map((row) => [(row.name as string).toLowerCase(), row.id as string]));
  const collabs: CollabRow[] = [...counts.entries()]
    .map(([name, count]) => ({ name, dj_id: knownByName.get(name.toLowerCase()) ?? null, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  return collabs;
}

export async function getDjLabels(djId: string): Promise<LabelRow[]> {
  if (!isDbMode) {
    const counts = new Map<string, number>();
    for (const event of (snapshot.events as EventRow[]).filter((e) => e.dj_id === djId)) {
      const name = event.name;
      const presents = name.match(/^(.+?)\s+(?:presents|present)\b/i);
      const org = name.match(/(.+?(?:records|music|sounds|collective|label|promotions))\b/i);
      const candidate = presents?.[1] ?? org?.[1];
      if (candidate) {
        const clean = candidate.replace(/[|,;&/]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (clean.length >= 3 && clean.length <= 50) counts.set(clean, (counts.get(clean) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }
  const pool = getPool();
  const events = await pool.query('SELECT name FROM events WHERE dj_id = $1', [djId]);
  const counts = new Map<string, number>();
  for (const event of events.rows) {
    const name = event.name as string;
    const presents = name.match(/^(.+?)\s+(?:presents|present)\b/i);
    const org = name.match(/(.+?(?:records|music|sounds|collective|label|promotions))\b/i);
    const candidate = presents?.[1] ?? org?.[1];
    if (candidate) {
      const clean = candidate.replace(/[|,;&/]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean.length >= 3 && clean.length <= 50) counts.set(clean, (counts.get(clean) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export interface SimilarDjRow extends DjRow {
  genre_overlap: number;
  shared_events: number;
}

export interface VenueRow {
  id: string;
  name: string;
  address: string | null;
  url: string | null;
}

export async function getVenues(): Promise<VenueRow[]> {
  if (!isDbMode) return (snapshot.venues as VenueRow[] | undefined) ?? [];
  const pool = getPool();
  const result = await pool.query('SELECT id, name, address, url FROM venues ORDER BY name');
  return result.rows as VenueRow[];
}

export async function getSimilarDjs(djId: string, limit = 6): Promise<SimilarDjRow[]> {
  if (!isDbMode) {
    const dj = (snapshot.djs as DjRow[]).find((row) => row.id === djId);
    if (!dj) return [];
    const djGenres = new Set(dj.genres);
    return (snapshot.djs as DjRow[])
      .filter((row) => row.id !== djId)
      .map((row) => ({
        ...row,
        genre_overlap: row.genres.filter((genre) => djGenres.has(genre)).length,
        shared_events: 0,
      }))
      .filter((row) => row.genre_overlap > 0)
      .sort((a, b) => b.genre_overlap - a.genre_overlap || b.popularity - a.popularity)
      .slice(0, limit);
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM (
       SELECT d2.*,
              (SELECT count(*) FROM (SELECT unnest(d.genres) INTERSECT SELECT unnest(d2.genres)) x) AS genre_overlap,
              (SELECT count(*) FROM events e1 JOIN events e2 ON e1.dj_id = d.id AND e2.dj_id = d2.id
                AND e1.venue = e2.venue AND e1.venue IS NOT NULL) AS shared_events
       FROM djs d, djs d2
       WHERE d.id = $1 AND d2.id <> $1 AND d2.opt_out = FALSE AND d2.active = TRUE
     ) t
     WHERE t.genre_overlap > 0 OR t.shared_events > 0
     ORDER BY t.genre_overlap DESC, t.shared_events DESC, t.popularity DESC
     LIMIT $2`,
    [djId, limit],
  );
  return result.rows as SimilarDjRow[];
}

export async function buildDossier(djId: string): Promise<string> {
  const [dj, mixes, articles, upcoming, past, collabs, labels] = await Promise.all([
    getDjById(djId),
    getDjMixes(djId),
    getDjArticles(djId),
    getDjGigs(djId, 5),
    getDjPastGigs(djId, 5),
    getDjCollabs(djId),
    getDjLabels(djId),
  ]);
  if (!dj) return '';
  const sentences: string[] = [];
  const genreText = dj.genres.length > 0 ? `playing ${dj.genres.join(', ')}` : 'with a sound still being mapped';
  sentences.push(`${dj.name} is a Wellington DJ ${genreText}.`);
  if (dj.bio) sentences.push(dj.bio);
  if (mixes.length > 0) {
    const platforms = [...new Set(mixes.map((mix) => mix.platform))].join(' and ');
    sentences.push(`${mixes.length} mix${mixes.length === 1 ? '' : 'es'} on ${platforms}.`);
  }
  if (collabs.length > 0) {
    sentences.push(`Recently played with ${collabs.slice(0, 4).map((c) => c.name).join(', ')}.`);
  }
  if (labels.length > 0) {
    sentences.push(`Associated with ${labels.slice(0, 3).map((l) => l.name).join(', ')}.`);
  }
  if (upcoming.length > 0) {
    sentences.push(`Upcoming: ${upcoming.slice(0, 3).map((g) => `${g.name}${g.venue ? ` at ${g.venue}` : ''}`).join('; ')}.`);
  }
  if (past.length > 0) {
    sentences.push(`Recent gigs include ${past.slice(0, 3).map((g) => g.name).join(', ')}.`);
  }
  if (articles.length > 0) {
    sentences.push(`Mentioned in ${articles.length} article${articles.length === 1 ? '' : 's'} (${articles[0].source ?? 'press'}).`);
  }
  return sentences.join(' ');
}
