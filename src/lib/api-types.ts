import type { SetRequired } from 'type-fest';
import type { DjRow, EventRow, MixRow, ArticleRow, LinkRow, CollabRow, LabelRow, SimilarDjRow } from './queries';

export interface DjSummary {
  id: string;
  name: string;
  genres: string[];
  bio: string | null;
  image_url: string | null;
  soundcloud_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  mixcloud_url: string | null;
  website_url: string | null;
  popularity: number;
  data_completeness: number;
  verification_level: number;
  verification_sources: string[];
  upcoming_events: number;
  last_played_at: string | null;
}

export interface DjDetail extends DjSummary {
  summary: string;
  links: LinkRow[];
  mixes: MixRow[];
  articles: ArticleRow[];
  collabs: CollabRow[];
  labels: LabelRow[];
  similar: SimilarDjRow[];
  upcoming_gigs: EventRow[];
  past_gigs: EventRow[];
}

export interface ListResponse<T> {
  data: T[];
  meta: { total: number; limit: number; offset: number };
}

export interface DatasetRow {
  djs: DjRow[];
  events: EventRow[];
  venues: Array<{ id: string; name: string; address: string | null; url: string | null }>;
  links: LinkRow[];
  articles: ArticleRow[];
  mixes: MixRow[];
}

export type DatasetExport = SetRequired<DatasetRow, 'djs' | 'events' | 'venues'> & {
  exportedAt: string;
  version: string;
};

export interface DatasetMeta {
  version: string;
  exportedAt: string;
  counts: { djs: number; events: number; venues: number; links: number; articles: number; mixes: number };
  license: string;
  sources: string[];
}

export function toDjSummary(dj: DjRow): DjSummary {
  return {
    id: dj.id,
    name: dj.name,
    genres: dj.genres,
    bio: dj.bio,
    image_url: dj.image_url,
    soundcloud_url: dj.soundcloud_url,
    instagram_url: dj.instagram_url,
    facebook_url: dj.facebook_url,
    mixcloud_url: dj.mixcloud_url,
    website_url: dj.website_url,
    popularity: dj.popularity,
    data_completeness: dj.data_completeness,
    verification_level: dj.verification_level,
    verification_sources: dj.verification_sources,
    upcoming_events: dj.upcoming_events,
    last_played_at: dj.last_played_at,
  };
}
