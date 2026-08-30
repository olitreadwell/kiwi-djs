import 'server-only';
import { cityFromLocation } from './locations';
import { PostgresRepo } from './repo/postgres';
import { SnapshotRepo } from './repo/snapshot';
import type { DataRepository, DjRow, LinkRow } from './repo/types';

export type {
  ArticleRow,
  CollabRow,
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
} from './repo/types';

export const isDbMode = Boolean(process.env.DATABASE_URL);

let activeRepo: DataRepository | null = null;

function getRepo(): DataRepository {
  if (activeRepo) return activeRepo;
  activeRepo = isDbMode ? new PostgresRepo() : new SnapshotRepo();
  return activeRepo;
}

export function listDjs(opts: Parameters<DataRepository['listDjs']>[0] = {}): ReturnType<DataRepository['listDjs']> {
  return getRepo().listDjs(opts);
}

export function getDjById(id: string): ReturnType<DataRepository['getDjById']> {
  return getRepo().getDjById(id);
}

export function getUpcomingEvents(limit = 60): ReturnType<DataRepository['getUpcomingEvents']> {
  return getRepo().getUpcomingEvents(limit);
}

export function getPastEvents(limit = 200): ReturnType<DataRepository['getPastEvents']> {
  return getRepo().getPastEvents(limit);
}

export function getEvents(opts: Parameters<DataRepository['getEvents']>[0] = {}): ReturnType<DataRepository['getEvents']> {
  return getRepo().getEvents(opts);
}

export function getGenres(): ReturnType<DataRepository['getGenres']> {
  return getRepo().getGenres();
}

export function getOrgs(): ReturnType<DataRepository['getOrgs']> {
  return getRepo().getOrgs();
}

export function getSoundsystems(): ReturnType<DataRepository['getSoundsystems']> {
  return getRepo().getSoundsystems();
}

export function getPopularDjs(limit = 8): ReturnType<DataRepository['getPopularDjs']> {
  return getRepo().getPopularDjs(limit);
}

export function getDjGigs(djId: string, limit = 20): ReturnType<DataRepository['getDjGigs']> {
  return getRepo().getDjGigs(djId, limit);
}

export function getDjMixes(djId: string): ReturnType<DataRepository['getDjMixes']> {
  return getRepo().getDjMixes(djId);
}

export function getDjReleases(djId: string): ReturnType<DataRepository['getDjReleases']> {
  return getRepo().getDjReleases(djId);
}

export function getDjArticles(djId: string): ReturnType<DataRepository['getDjArticles']> {
  return getRepo().getDjArticles(djId);
}

export function getDjLinks(djId: string): ReturnType<DataRepository['getDjLinks']> {
  return getRepo().getDjLinks(djId);
}

export function getDjPastGigs(djId: string, limit = 20): ReturnType<DataRepository['getDjPastGigs']> {
  return getRepo().getDjPastGigs(djId, limit);
}

export function getDjCollabs(djId: string): ReturnType<DataRepository['getDjCollabs']> {
  return getRepo().getDjCollabs(djId);
}

export function getDjLabels(djId: string): ReturnType<DataRepository['getDjLabels']> {
  return getRepo().getDjLabels(djId);
}

export function getVenues(): ReturnType<DataRepository['getVenues']> {
  return getRepo().getVenues();
}

export function getVenuesWithCounts(): ReturnType<DataRepository['getVenuesWithCounts']> {
  return getRepo().getVenuesWithCounts();
}

export function getVenueById(id: string): ReturnType<DataRepository['getVenueById']> {
  return getRepo().getVenueById(id);
}

export function getVenueEvents(venueName: string, limit = 30): ReturnType<DataRepository['getVenueEvents']> {
  return getRepo().getVenueEvents(venueName, limit);
}

export function getEventById(id: string): ReturnType<DataRepository['getEventById']> {
  return getRepo().getEventById(id);
}

export function getEventLineup(eventId: string): ReturnType<DataRepository['getEventLineup']> {
  return getRepo().getEventLineup(eventId);
}

export function getWeekendEvents(limit = 60): ReturnType<DataRepository['getWeekendEvents']> {
  return getRepo().getWeekendEvents(limit);
}

export function getSimilarDjs(djId: string, limit = 6): ReturnType<DataRepository['getSimilarDjs']> {
  return getRepo().getSimilarDjs(djId, limit);
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

export async function buildDossier(djId: string): Promise<string> {
  const repo = getRepo();
  const [dj, mixes, articles, upcoming, past, collabs, labels] = await Promise.all([
    repo.getDjById(djId),
    repo.getDjMixes(djId),
    repo.getDjArticles(djId),
    repo.getDjGigs(djId, 5),
    repo.getDjPastGigs(djId, 5),
    repo.getDjCollabs(djId),
    repo.getDjLabels(djId),
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
