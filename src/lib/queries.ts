import 'server-only';
import { getPool } from './db';
import snapshot from '@/data/snapshot.json';
import { extractArtistNames } from './scrapers/discover';
import { cityFromLocation } from './locations';

export const isDbMode = Boolean(process.env.DATABASE_URL);

const completenessSql = `(
  (CASE WHEN bio IS NOT NULL THEN 15 ELSE 0 END) +
  (CASE WHEN cardinality(genres) > 0 THEN 5 ELSE 0 END) +
  (CASE WHEN image_url IS NOT NULL THEN 10 ELSE 0 END) +
  (CASE WHEN soundcloud_url IS NOT NULL OR instagram_url IS NOT NULL OR facebook_url IS NOT NULL
         OR website_url IS NOT NULL OR mixcloud_url IS NOT NULL THEN 10 ELSE 0 END) +
  (SELECT LEAST(30, count(*)::int * 10) FROM dj_mixes m WHERE m.dj_id = d.id) +
  (SELECT LEAST(20, count(*)::int * 5) FROM event_djs ed WHERE ed.dj_id = d.id) +
  (SELECT LEAST(10, count(*)::int * 5) FROM dj_articles a WHERE a.dj_id = d.id)
)`;

export interface DjRow {
  id: string;
  name: string;
  bio: string | null;
  summary?: string | null;
  summary_long?: string | null;
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
  city?: string | null;
  profile_location?: string | null;
  upcoming_events: number;
  mix_count?: number;
  past_gig_count?: number;
  last_played_at: string | null;
  created_at: string;
  updated_at: string;
  bpm_range?: string | null;
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
  region: string | null;
  is_dj_event?: boolean;
  archive_url?: string | null;
}

interface EventDjLink {
  event_id: string;
  dj_id: string;
}

export interface OrgRow {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
}

export interface SoundsystemRow {
  id: string;
  name: string;
  city: string | null;
  style: string | null;
  description: string | null;
  website: string | null;
}

export async function listDjs(opts: { query?: string; genre?: string; sort?: string } = {}): Promise<DjRow[]> {
  if (!isDbMode) {
    let rows = snapshot.djs as DjRow[];
    rows = rows.filter((dj) => dj.active === true);
    if (opts.query) {
      const q = opts.query.toLowerCase();
      rows = rows.filter((dj) => `${dj.name} ${dj.bio ?? ''} ${dj.genres.join(' ')}`.toLowerCase().includes(q));
    }
    if (opts.genre) rows = rows.filter((dj) => dj.genres.includes(opts.genre!));
    return sortDjs(rows, opts.sort);
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
    `SELECT * FROM (
       SELECT d.id, d.name, d.bio, d.summary, d.summary_long, d.genres, d.city, d.image_url, d.soundcloud_url, d.instagram_url,
              d.facebook_url, d.mixcloud_url, d.website_url, d.active, d.popularity, d.source, d.opt_out,
              d.mixcloud_backoff_until, d.discovery_note, d.verification_level, d.verification_sources, d.profile_location,
              d.is_nz, d.created_at, d.updated_at,
              ${completenessSql} AS data_completeness,
              (SELECT count(*) FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = d.id AND e.starts_at > now()) AS upcoming_events,
              (SELECT count(*) FROM dj_mixes m WHERE m.dj_id = d.id) AS mix_count,
              (SELECT count(*) FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS past_gig_count,
              (SELECT max(e2.starts_at) FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS last_played_at
       FROM djs d
       WHERE ${where.join(' AND ')}
     ) sub
     ${sortSql(opts.sort)}`,
    params,
  );
  return result.rows as DjRow[];
}

function sortSql(sort?: string): string {
  switch (sort) {
    case 'name':
      return 'ORDER BY name ASC';
    case 'popularity':
      return 'ORDER BY popularity DESC, name ASC';
    case 'recent':
      return 'ORDER BY created_at DESC, name ASC';
    case 'updated':
      return 'ORDER BY updated_at DESC, name ASC';
    case 'gigs':
      return 'ORDER BY upcoming_events DESC, name ASC';
    case 'completeness':
    default:
      return 'ORDER BY data_completeness DESC, name ASC';
  }
}

function sortDjs(rows: DjRow[], sort?: string): DjRow[] {
  switch (sort) {
    case 'name':
      return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    case 'popularity':
      return [...rows].sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));
    case 'recent':
      return [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || a.name.localeCompare(b.name));
    case 'updated':
      return [...rows].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)) || a.name.localeCompare(b.name));
    case 'gigs':
      return [...rows].sort((a, b) => b.upcoming_events - a.upcoming_events || a.name.localeCompare(b.name));
    case 'completeness':
    default:
      return [...rows].sort((a, b) => b.data_completeness - a.data_completeness || a.name.localeCompare(b.name));
  }
}

export async function getDjById(id: string): Promise<DjRow | null> {
  if (!isDbMode) {
    return (snapshot.djs as DjRow[]).find((dj) => dj.id === id && dj.active === true) ?? null;
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT d.*, ${completenessSql} AS data_completeness,
            (SELECT count(*) FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = d.id AND e.starts_at > now()) AS upcoming_events,
            (SELECT count(*) FROM dj_mixes m WHERE m.dj_id = d.id) AS mix_count,
            (SELECT count(*) FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS past_gig_count,
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
      .filter((event) => event.is_dj_event !== false && event.starts_at && new Date(event.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, limit);
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name, v.region
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
     WHERE e.starts_at > now()
         AND e.is_dj_event = TRUE
     ORDER BY e.starts_at ASC
     LIMIT $1`,
    [limit],
  );
  return result.rows as EventRow[];
}

export async function getPastEvents(limit = 200): Promise<EventRow[]> {
  if (!isDbMode) {
    const now = Date.now();
    return (snapshot.events as EventRow[])
      .filter((event) => event.is_dj_event !== false && event.starts_at && new Date(event.starts_at).getTime() <= now)
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
      .slice(0, limit);
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name, v.region
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
     WHERE e.starts_at <= now() AND e.is_dj_event = TRUE
     ORDER BY e.starts_at DESC
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
    if (opts.upcoming !== false) rows = rows.filter((event) => event.is_dj_event !== false && event.starts_at && new Date(event.starts_at).getTime() > now);
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
    where.push('e.is_dj_event = TRUE');
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
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name, v.region
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
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

export async function getOrgs(): Promise<OrgRow[]> {
  if (!isDbMode) return (snapshot.orgs as OrgRow[] | undefined) ?? [];
  const pool = getPool();
  const result = await pool.query('SELECT id, name, city, description, website, instagram, facebook FROM orgs ORDER BY name ASC');
  return result.rows as OrgRow[];
}

export async function getSoundsystems(): Promise<SoundsystemRow[]> {
  if (!isDbMode) return (snapshot.soundsystems as SoundsystemRow[] | undefined) ?? [];
  const pool = getPool();
  const result = await pool.query('SELECT id, name, city, style, description, website FROM soundsystems ORDER BY name ASC');
  return result.rows as SoundsystemRow[];
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
            (SELECT count(*) FROM dj_mixes m WHERE m.dj_id = d.id) AS mix_count,
            (SELECT count(*) FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS past_gig_count,
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

export interface ReleaseRow {
  id: string;
  dj_id: string;
  title: string;
  year: number | null;
  label: string | null;
  format: string | null;
  url: string | null;
}

export interface ArticleRow {
  id: string;
  dj_id: string;
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  snippet: string | null;
  archive_url?: string | null;
}

export interface LinkRow {
  id: string;
  dj_id: string;
  type: string;
  url: string;
  label: string | null;
  created_at: string | null;
  helpful: number;
  unhelpful: number;
  followers: number;
  archive_url?: string | null;
  track_count: number;
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

export async function getDjReleases(djId: string): Promise<ReleaseRow[]> {
  if (!isDbMode) return (snapshot.releases as ReleaseRow[] | undefined)?.filter((release) => release.dj_id === djId) ?? [];
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, dj_id, title, year, label, format, url FROM dj_releases WHERE dj_id = $1 ORDER BY year DESC NULLS LAST, title ASC`,
    [djId],
  );
  return result.rows as ReleaseRow[];
}

export async function getDjArticles(djId: string): Promise<ArticleRow[]> {
  if (!isDbMode) return (snapshot.articles as ArticleRow[] | undefined)?.filter((article) => article.dj_id === djId) ?? [];
  const pool = getPool();
  const result = await pool.query(
    `SELECT DISTINCT ON (lower(title)) id, title, url, source, published_at, snippet
     FROM dj_articles WHERE dj_id = $1
     ORDER BY lower(title), published_at DESC NULLS LAST`,
    [djId],
  );
  return result.rows as ArticleRow[];
}

export async function getDjLinks(djId: string): Promise<LinkRow[]> {
  if (!isDbMode) {
    return (snapshot.links as LinkRow[] | undefined)
      ?.filter((link) => link.dj_id === djId)
      .map((link) => ({ ...link, created_at: null, helpful: link.helpful ?? 0, unhelpful: link.unhelpful ?? 0, followers: link.followers ?? 0, track_count: link.track_count ?? 0 })) ?? [];
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT l.id, l.dj_id, l.type, l.url, l.label, l.created_at, l.followers, l.track_count,
            count(f.id) FILTER (WHERE f.helpful)::int AS helpful,
            count(f.id) FILTER (WHERE NOT f.helpful)::int AS unhelpful
     FROM dj_links l LEFT JOIN link_feedback f ON f.link_id = l.id
     WHERE l.dj_id = $1
     GROUP BY l.id
     ORDER BY l.type, l.created_at`,
    [djId],
  );
  return result.rows as LinkRow[];
}

// The best link per platform type: the most active profile wins (followers
// and mixes beat a stale canonical pick — e.g. Frank Booker's real account
// has 11k followers while the stored column points at an empty namesake),
// then community feedback, then the canonical column as a tiebreak, then
// the earliest added. All links stay in the data — this only picks what to show.
export function pickBestLinks(dj: Pick<DjRow, 'soundcloud_url' | 'mixcloud_url' | 'instagram_url' | 'facebook_url' | 'website_url'>, links: LinkRow[]): LinkRow[] {
  const canonical: Record<string, string | null> = {
    soundcloud: dj.soundcloud_url,
    mixcloud: dj.mixcloud_url,
    instagram: dj.instagram_url,
    facebook: dj.facebook_url,
    website: dj.website_url,
  };
  const byType = new Map<string, LinkRow[]>();
  for (const link of links) {
    const bucket = byType.get(link.type) ?? [];
    bucket.push(link);
    byType.set(link.type, bucket);
  }
  const best: LinkRow[] = [];
  for (const group of byType.values()) {
    group.sort((a, b) => {
      const aScore =
        a.followers + a.track_count * 5 + (a.helpful - a.unhelpful) * 100 + (canonical[a.type] !== null && a.url === canonical[a.type] ? 1 : 0);
      const bScore =
        b.followers + b.track_count * 5 + (b.helpful - b.unhelpful) * 100 + (canonical[b.type] !== null && b.url === canonical[b.type] ? 1 : 0);
      if (aScore !== bScore) return bScore - aScore;
      return String(a.created_at ?? '9999').localeCompare(String(b.created_at ?? '9999'));
    });
    best.push(group[0]);
  }
  return best;
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
  region: string | null;
}

export async function getVenues(): Promise<VenueRow[]> {
  if (!isDbMode) return (snapshot.venues as VenueRow[] | undefined) ?? [];
  const pool = getPool();
  const result = await pool.query('SELECT id, name, address, url, region FROM venues ORDER BY name');
  return result.rows as VenueRow[];
}

export interface VenueWithCounts extends VenueRow {
  upcoming_events: number;
}

export async function getVenuesWithCounts(): Promise<VenueWithCounts[]> {
  if (!isDbMode) {
    const now = Date.now();
    return (snapshot.venues as VenueRow[]).map((venue) => ({
      ...venue,
      upcoming_events: (snapshot.events as EventRow[]).filter(
        (event) => event.venue?.toLowerCase() === venue.name.toLowerCase() && event.starts_at && new Date(event.starts_at).getTime() > now,
      ).length,
    }));
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT v.id, v.name, v.address, v.url, v.region,
            (SELECT count(*) FROM events e WHERE e.venue = v.name AND e.starts_at > now()) AS upcoming_events
     FROM venues v ORDER BY v.name`,
  );
  return result.rows as VenueWithCounts[];
}

export async function getVenueById(id: string): Promise<VenueRow | null> {
  if (!isDbMode) {
    return (snapshot.venues as VenueRow[]).find((venue) => venue.id === id) ?? null;
  }
  const pool = getPool();
  const result = await pool.query('SELECT id, name, address, url, region FROM venues WHERE id = $1', [id]);
  return (result.rows[0] as VenueRow) ?? null;
}

export async function getVenueEvents(venueName: string, limit = 30): Promise<EventRow[]> {
  if (!isDbMode) {
    const now = Date.now();
    return (snapshot.events as EventRow[])
      .filter(
        (event) =>
          event.is_dj_event !== false &&
          event.venue?.toLowerCase() === venueName.toLowerCase() &&
          event.starts_at &&
          new Date(event.starts_at).getTime() > now,
      )
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, limit);
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name, v.region
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
     WHERE e.venue ILIKE $1 AND e.starts_at > now() AND e.is_dj_event = TRUE
     ORDER BY e.starts_at ASC LIMIT $2`,
    [venueName, limit],
  );
  return result.rows as EventRow[];
}

export async function getEventById(id: string): Promise<EventRow | null> {
  if (!isDbMode) {
    return (snapshot.events as EventRow[]).find((event) => event.id === id) ?? null;
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name, v.region
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
     WHERE e.id = $1`,
    [id],
  );
  return (result.rows[0] as EventRow) ?? null;
}

export async function getEventLineup(eventId: string): Promise<DjRow[]> {
  if (!isDbMode) {
    const djById = new Map((snapshot.djs as DjRow[]).map((dj) => [dj.id, dj]));
    const ids = ((snapshot.eventDjs ?? []) as EventDjLink[]).filter((link) => link.event_id === eventId).map((link) => link.dj_id);
    return ids.map((djId) => djById.get(djId)).filter((dj): dj is DjRow => Boolean(dj));
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT d.*, ${completenessSql} AS data_completeness,
            (SELECT count(*) FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = d.id AND e.starts_at > now()) AS upcoming_events,
            (SELECT max(e2.starts_at) FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS last_played_at
     FROM event_djs ed JOIN djs d ON d.id = ed.dj_id
     WHERE ed.event_id = $1 AND d.opt_out = FALSE AND d.active = TRUE
     ORDER BY d.name ASC`,
    [eventId],
  );
  return result.rows as DjRow[];
}

function endOfWeekendUtc(now = new Date()): Date {
  const end = new Date(now);
  const daysUntilSunday = (7 - end.getUTCDay()) % 7;
  end.setUTCDate(end.getUTCDate() + daysUntilSunday);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

export async function getWeekendEvents(limit = 60): Promise<EventRow[]> {
  if (!isDbMode) {
    const now = Date.now();
    const end = endOfWeekendUtc().getTime();
    return (snapshot.events as EventRow[])
      .filter(
        (event) =>
          event.is_dj_event !== false &&
          event.starts_at &&
          new Date(event.starts_at).getTime() > now &&
          new Date(event.starts_at).getTime() <= end,
      )
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, limit);
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name, v.region
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
     WHERE e.starts_at > now() AND e.starts_at <= $1 AND e.is_dj_event = TRUE
     ORDER BY e.starts_at ASC LIMIT $2`,
    [endOfWeekendUtc().toISOString(), limit],
  );
  return result.rows as EventRow[];
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
  const city = cityFromLocation(dj.profile_location);
  sentences.push(city ? `${dj.name} is a ${city} DJ ${genreText}.` : `${dj.name} is a DJ ${genreText}.`);
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
