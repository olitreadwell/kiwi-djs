import 'server-only';
import { getPool } from '@/lib/db';
import { extractArtistNames } from '@/lib/scrapers/discover';
import type {
  ArticleRow,
  CollabRow,
  DataRepository,
  DjQueryOptions,
  DjRow,
  EventQueryOptions,
  EventRow,
  LabelRow,
  LinkRow,
  MixRow,
  OrgRow,
  ReleaseRow,
  SimilarDjRow,
  SoundsystemRow,
  VenueRow,
  VenueWithCounts,
} from './types';

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

const djSelect = `SELECT d.id, d.name, d.bio, d.summary, d.summary_long, d.genres, d.city, d.image_url, d.soundcloud_url, d.instagram_url,
       d.facebook_url, d.mixcloud_url, d.website_url, d.active, d.popularity, d.source, d.opt_out,
       d.mixcloud_backoff_until, d.discovery_note, d.verification_level, d.verification_sources, d.profile_location,
       d.is_nz, d.created_at, d.updated_at, d.bpm_range,
       ${completenessSql} AS data_completeness,
       (SELECT count(*) FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = d.id AND e.starts_at > now()) AS upcoming_events,
       (SELECT count(*) FROM dj_mixes m WHERE m.dj_id = d.id) AS mix_count,
       (SELECT count(*) FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS past_gig_count,
       (SELECT max(e2.starts_at) FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS last_played_at`;

const eventSelect = `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name, v.region`;

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

function endOfWeekendUtc(now = new Date()): Date {
  const end = new Date(now);
  const daysUntilSunday = (7 - end.getUTCDay()) % 7;
  end.setUTCDate(end.getUTCDate() + daysUntilSunday);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * Live Postgres read model — used when a managed `DATABASE_URL` is present
 * (dev DB locally, Supabase/Neon in prod once wired). Mirrors the read model
 * in `snapshot.ts`.
 */
export class PostgresRepo implements DataRepository {
  async listDjs(opts: DjQueryOptions = {}): Promise<DjRow[]> {
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
         ${djSelect}
       FROM djs d
       WHERE ${where.join(' AND ')}
       ) sub
       ${sortSql(opts.sort)}`,
      params,
    );
    return result.rows as DjRow[];
  }

  async getDjById(id: string): Promise<DjRow | null> {
    const pool = getPool();
    const result = await pool.query(
      `${djSelect}
       FROM djs d WHERE d.id = $1 AND d.opt_out = FALSE AND d.active = TRUE AND d.is_nz = TRUE`,
      [id],
    );
    return (result.rows[0] as DjRow) ?? null;
  }

  async getUpcomingEvents(limit = 60): Promise<EventRow[]> {
    const pool = getPool();
    const result = await pool.query(
      `${eventSelect}
       FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
       WHERE e.starts_at > now() AND e.is_dj_event = TRUE
       ORDER BY e.starts_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows as EventRow[];
  }

  async getPastEvents(limit = 200): Promise<EventRow[]> {
    const pool = getPool();
    const result = await pool.query(
      `${eventSelect}
       FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
       WHERE e.starts_at <= now() AND e.is_dj_event = TRUE
       ORDER BY e.starts_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows as EventRow[];
  }

  async getEvents(opts: EventQueryOptions = {}): Promise<EventRow[]> {
    const pool = getPool();
    const limit = Math.min(opts.limit ?? 100, 500);
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
      `${eventSelect}
       FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY e.starts_at ASC NULLS LAST
       LIMIT $${params.length + 1}`,
      [...params, limit],
    );
    return result.rows as EventRow[];
  }

  async getGenres(): Promise<string[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT DISTINCT unnest(genres) AS genre FROM djs WHERE opt_out = FALSE AND active = TRUE ORDER BY genre`,
    );
    return result.rows.map((row) => row.genre as string);
  }

  async getOrgs(): Promise<OrgRow[]> {
    const pool = getPool();
    const result = await pool.query('SELECT id, name, city, description, website, instagram, facebook FROM orgs ORDER BY name ASC');
    return result.rows as OrgRow[];
  }

  async getSoundsystems(): Promise<SoundsystemRow[]> {
    const pool = getPool();
    const result = await pool.query('SELECT id, name, city, style, description, website FROM soundsystems ORDER BY name ASC');
    return result.rows as SoundsystemRow[];
  }

  async getPopularDjs(limit = 8): Promise<DjRow[]> {
    const pool = getPool();
    const result = await pool.query(
      `${djSelect}
       FROM djs d
       WHERE d.opt_out = FALSE AND d.active = TRUE AND d.is_nz = TRUE
       ORDER BY d.popularity DESC, d.name ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows as DjRow[];
  }

  async getDjGigs(djId: string, limit = 20): Promise<EventRow[]> {
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

  async getDjMixes(djId: string): Promise<MixRow[]> {
    const pool = getPool();
    const result = await pool.query('SELECT id, title, url, platform, kind FROM dj_mixes WHERE dj_id = $1 ORDER BY created_at DESC', [djId]);
    return result.rows as MixRow[];
  }

  async getDjReleases(djId: string): Promise<ReleaseRow[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, dj_id, title, year, label, format, url FROM dj_releases WHERE dj_id = $1 ORDER BY year DESC NULLS LAST, title ASC`,
      [djId],
    );
    return result.rows as ReleaseRow[];
  }

  async getDjArticles(djId: string): Promise<ArticleRow[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT DISTINCT ON (lower(title)) id, title, url, source, published_at, snippet
       FROM dj_articles WHERE dj_id = $1
       ORDER BY lower(title), published_at DESC NULLS LAST`,
      [djId],
    );
    return result.rows as ArticleRow[];
  }

  async getDjLinks(djId: string): Promise<LinkRow[]> {
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

  async getDjPastGigs(djId: string, limit = 20): Promise<EventRow[]> {
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

  async getDjCollabs(djId: string): Promise<CollabRow[]> {
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
    return [...counts.entries()]
      .map(([name, count]) => ({ name, dj_id: knownByName.get(name.toLowerCase()) ?? null, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }

  async getDjLabels(djId: string): Promise<LabelRow[]> {
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

  async getVenues(): Promise<VenueRow[]> {
    const pool = getPool();
    const result = await pool.query('SELECT id, name, address, url, region FROM venues ORDER BY name');
    return result.rows as VenueRow[];
  }

  async getVenuesWithCounts(): Promise<VenueWithCounts[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT v.id, v.name, v.address, v.url, v.region,
              (SELECT count(*) FROM events e WHERE e.venue = v.name AND e.starts_at > now()) AS upcoming_events
       FROM venues v ORDER BY v.name`,
    );
    return result.rows as VenueWithCounts[];
  }

  async getVenueById(id: string): Promise<VenueRow | null> {
    const pool = getPool();
    const result = await pool.query('SELECT id, name, address, url, region FROM venues WHERE id = $1', [id]);
    return (result.rows[0] as VenueRow) ?? null;
  }

  async getVenueEvents(venueName: string, limit = 30): Promise<EventRow[]> {
    const pool = getPool();
    const result = await pool.query(
      `${eventSelect}
       FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
       WHERE e.venue ILIKE $1 AND e.starts_at > now() AND e.is_dj_event = TRUE
       ORDER BY e.starts_at ASC LIMIT $2`,
      [venueName, limit],
    );
    return result.rows as EventRow[];
  }

  async getEventById(id: string): Promise<EventRow | null> {
    const pool = getPool();
    const result = await pool.query(
      `${eventSelect}
       FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
       WHERE e.id = $1`,
      [id],
    );
    return (result.rows[0] as EventRow) ?? null;
  }

  async getEventLineup(eventId: string): Promise<DjRow[]> {
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

  async getWeekendEvents(limit = 60): Promise<EventRow[]> {
    const pool = getPool();
    const result = await pool.query(
      `${eventSelect}
       FROM events e LEFT JOIN djs d ON d.id = e.dj_id LEFT JOIN venues v ON v.name = e.venue
       WHERE e.starts_at > now() AND e.starts_at <= $1 AND e.is_dj_event = TRUE
       ORDER BY e.starts_at ASC LIMIT $2`,
      [endOfWeekendUtc().toISOString(), limit],
    );
    return result.rows as EventRow[];
  }

  async getSimilarDjs(djId: string, limit = 6): Promise<SimilarDjRow[]> {
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
}
