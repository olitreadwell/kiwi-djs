import 'server-only';
import snapshot from '@/data/snapshot.json';
import { extractArtistNames } from '@/lib/scrapers/discover';
import type {
  ArticleRow,
  CollabRow,
  DataRepository,
  DjQueryOptions,
  DjRow,
  EventDjLink,
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

function endOfWeekendUtc(now = new Date()): Date {
  const end = new Date(now);
  const daysUntilSunday = (7 - end.getUTCDay()) % 7;
  end.setUTCDate(end.getUTCDate() + daysUntilSunday);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * Serves the exported `src/data/snapshot.json` — the production path until a
 * managed Postgres is wired up. Mirrors the SQL read model in `postgres.ts`.
 */
export class SnapshotRepo implements DataRepository {
  async listDjs(opts: DjQueryOptions = {}): Promise<DjRow[]> {
    let rows = snapshot.djs as DjRow[];
    rows = rows.filter((dj) => dj.active === true);
    if (opts.query) {
      const q = opts.query.toLowerCase();
      rows = rows.filter((dj) => `${dj.name} ${dj.bio ?? ''} ${dj.genres.join(' ')}`.toLowerCase().includes(q));
    }
    if (opts.genre) rows = rows.filter((dj) => dj.genres.includes(opts.genre!));
    return sortDjs(rows, opts.sort);
  }

  async getDjById(id: string): Promise<DjRow | null> {
    return (snapshot.djs as DjRow[]).find((dj) => dj.id === id && dj.active === true) ?? null;
  }

  async getUpcomingEvents(limit = 60): Promise<EventRow[]> {
    const now = Date.now();
    return (snapshot.events as EventRow[])
      .filter((event) => event.is_dj_event !== false && event.starts_at && new Date(event.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, limit);
  }

  async getPastEvents(limit = 200): Promise<EventRow[]> {
    const now = Date.now();
    return (snapshot.events as EventRow[])
      .filter((event) => event.is_dj_event !== false && event.starts_at && new Date(event.starts_at).getTime() <= now)
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
      .slice(0, limit);
  }

  async getEvents(opts: EventQueryOptions = {}): Promise<EventRow[]> {
    const limit = Math.min(opts.limit ?? 100, 500);
    let rows = snapshot.events as EventRow[];
    const now = Date.now();
    if (opts.upcoming !== false) rows = rows.filter((event) => event.is_dj_event !== false && event.starts_at && new Date(event.starts_at).getTime() > now);
    if (opts.venue) rows = rows.filter((event) => event.venue?.toLowerCase() === opts.venue!.toLowerCase());
    if (opts.dj) rows = rows.filter((event) => event.dj_id === opts.dj);
    return rows
      .sort((a, b) => (a.starts_at ? new Date(a.starts_at).getTime() : 0) - (b.starts_at ? new Date(b.starts_at).getTime() : 0))
      .slice(0, limit);
  }

  async getGenres(): Promise<string[]> {
    return [...new Set((snapshot.djs as DjRow[]).flatMap((dj) => dj.genres))].sort();
  }

  async getOrgs(): Promise<OrgRow[]> {
    return (snapshot.orgs as OrgRow[] | undefined) ?? [];
  }

  async getSoundsystems(): Promise<SoundsystemRow[]> {
    return (snapshot.soundsystems as SoundsystemRow[] | undefined) ?? [];
  }

  async getPopularDjs(limit = 8): Promise<DjRow[]> {
    return (snapshot.djs as DjRow[])
      .filter((dj) => dj.active)
      .sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  async getDjGigs(djId: string, limit = 20): Promise<EventRow[]> {
    const now = Date.now();
    const djEventIds = new Set(((snapshot.eventDjs ?? []) as EventDjLink[]).filter((link) => link.dj_id === djId).map((link) => link.event_id));
    return (snapshot.events as EventRow[])
      .filter((event) => djEventIds.has(event.id) && event.starts_at && new Date(event.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, limit);
  }

  async getDjMixes(djId: string): Promise<MixRow[]> {
    return (snapshot.mixes as MixRow[] | undefined)?.filter((mix) => mix.dj_id === djId) ?? [];
  }

  async getDjReleases(djId: string): Promise<ReleaseRow[]> {
    return (snapshot.releases as ReleaseRow[] | undefined)?.filter((release) => release.dj_id === djId) ?? [];
  }

  async getDjArticles(djId: string): Promise<ArticleRow[]> {
    return (snapshot.articles as ArticleRow[] | undefined)?.filter((article) => article.dj_id === djId) ?? [];
  }

  async getDjLinks(djId: string): Promise<LinkRow[]> {
    return (
      (snapshot.links as LinkRow[] | undefined)
        ?.filter((link) => link.dj_id === djId)
        .map((link) => ({ ...link, created_at: null, helpful: link.helpful ?? 0, unhelpful: link.unhelpful ?? 0, followers: link.followers ?? 0, track_count: link.track_count ?? 0 })) ?? []
    );
  }

  async getDjPastGigs(djId: string, limit = 20): Promise<EventRow[]> {
    const now = Date.now();
    const djEventIds = new Set(((snapshot.eventDjs ?? []) as EventDjLink[]).filter((link) => link.dj_id === djId).map((link) => link.event_id));
    return (snapshot.events as EventRow[])
      .filter((event) => djEventIds.has(event.id) && event.starts_at && new Date(event.starts_at).getTime() <= now)
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
      .slice(0, limit);
  }

  async getDjCollabs(djId: string): Promise<CollabRow[]> {
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

  async getDjLabels(djId: string): Promise<LabelRow[]> {
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

  async getVenues(): Promise<VenueRow[]> {
    return (snapshot.venues as VenueRow[] | undefined) ?? [];
  }

  async getVenuesWithCounts(): Promise<VenueWithCounts[]> {
    const now = Date.now();
    return (snapshot.venues as VenueRow[]).map((venue) => ({
      ...venue,
      upcoming_events: (snapshot.events as EventRow[]).filter(
        (event) => event.venue?.toLowerCase() === venue.name.toLowerCase() && event.starts_at && new Date(event.starts_at).getTime() > now,
      ).length,
    }));
  }

  async getVenueById(id: string): Promise<VenueRow | null> {
    return (snapshot.venues as VenueRow[]).find((venue) => venue.id === id) ?? null;
  }

  async getVenueEvents(venueName: string, limit = 30): Promise<EventRow[]> {
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

  async getEventById(id: string): Promise<EventRow | null> {
    return (snapshot.events as EventRow[]).find((event) => event.id === id) ?? null;
  }

  async getEventLineup(eventId: string): Promise<DjRow[]> {
    const djById = new Map((snapshot.djs as DjRow[]).map((dj) => [dj.id, dj]));
    const ids = ((snapshot.eventDjs ?? []) as EventDjLink[]).filter((link) => link.event_id === eventId).map((link) => link.dj_id);
    return ids.map((djId) => djById.get(djId)).filter((dj): dj is DjRow => Boolean(dj));
  }

  async getWeekendEvents(limit = 60): Promise<EventRow[]> {
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

  async getSimilarDjs(djId: string, limit = 6): Promise<SimilarDjRow[]> {
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
}
