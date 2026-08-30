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

export interface EventDjLink {
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

export interface VenueWithCounts extends VenueRow {
  upcoming_events: number;
}

export interface DjQueryOptions {
  query?: string;
  genre?: string;
  sort?: string;
}

export interface EventQueryOptions {
  upcoming?: boolean;
  venue?: string;
  dj?: string;
  limit?: number;
}

/**
 * Read model for the public site + API. Every consuming page or route talks
 * to this interface; the active implementation is chosen once in
 * `src/lib/queries.ts` based on whether a managed `DATABASE_URL` exists.
 */
export interface DataRepository {
  listDjs(opts?: DjQueryOptions): Promise<DjRow[]>;
  getDjById(id: string): Promise<DjRow | null>;
  getUpcomingEvents(limit?: number): Promise<EventRow[]>;
  getPastEvents(limit?: number): Promise<EventRow[]>;
  getEvents(opts?: EventQueryOptions): Promise<EventRow[]>;
  getGenres(): Promise<string[]>;
  getOrgs(): Promise<OrgRow[]>;
  getSoundsystems(): Promise<SoundsystemRow[]>;
  getPopularDjs(limit?: number): Promise<DjRow[]>;
  getDjGigs(djId: string, limit?: number): Promise<EventRow[]>;
  getDjMixes(djId: string): Promise<MixRow[]>;
  getDjReleases(djId: string): Promise<ReleaseRow[]>;
  getDjArticles(djId: string): Promise<ArticleRow[]>;
  getDjLinks(djId: string): Promise<LinkRow[]>;
  getDjPastGigs(djId: string, limit?: number): Promise<EventRow[]>;
  getDjCollabs(djId: string): Promise<CollabRow[]>;
  getDjLabels(djId: string): Promise<LabelRow[]>;
  getVenues(): Promise<VenueRow[]>;
  getVenuesWithCounts(): Promise<VenueWithCounts[]>;
  getVenueById(id: string): Promise<VenueRow | null>;
  getVenueEvents(venueName: string, limit?: number): Promise<EventRow[]>;
  getEventById(id: string): Promise<EventRow | null>;
  getEventLineup(eventId: string): Promise<DjRow[]>;
  getWeekendEvents(limit?: number): Promise<EventRow[]>;
  getSimilarDjs(djId: string, limit?: number): Promise<SimilarDjRow[]>;
}
