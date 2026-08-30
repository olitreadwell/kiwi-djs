import { z } from 'zod';
import type { JsonObject } from 'type-fest';

// Single source of truth for the public API: response payloads (used to
// generate the OpenAPI components) and query params (validated at the route
// boundary). Keep in sync with `src/lib/api-types.ts` and `src/lib/repo/types.ts`.

export const djSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  genres: z.array(z.string()),
  bio: z.string().nullable(),
  summary: z.string().nullable(),
  summary_long: z.string().nullable(),
  image_url: z.string().nullable(),
  soundcloud_url: z.string().nullable(),
  instagram_url: z.string().nullable(),
  facebook_url: z.string().nullable(),
  mixcloud_url: z.string().nullable(),
  website_url: z.string().nullable(),
  popularity: z.number().int(),
  data_completeness: z.number().int(),
  verification_level: z.number().int(),
  verification_sources: z.array(z.string()),
  upcoming_events: z.number().int(),
  last_played_at: z.string().nullable(),
});

export const djRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  bio: z.string().nullable(),
  summary: z.string().nullish(),
  summary_long: z.string().nullish(),
  genres: z.array(z.string()),
  image_url: z.string().nullable(),
  soundcloud_url: z.string().nullable(),
  instagram_url: z.string().nullable(),
  facebook_url: z.string().nullable(),
  mixcloud_url: z.string().nullable(),
  website_url: z.string().nullable(),
  active: z.boolean(),
  popularity: z.number().int(),
  data_completeness: z.number().int(),
  verification_level: z.number().int(),
  verification_sources: z.array(z.string()),
  source: z.string(),
  is_nz: z.boolean(),
  city: z.string().nullish(),
  profile_location: z.string().nullish(),
  upcoming_events: z.number().int(),
  mix_count: z.number().int().nullish(),
  past_gig_count: z.number().int().nullish(),
  last_played_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  bpm_range: z.string().nullish(),
});

export const similarDjSchema = djRowSchema.extend({
  genre_overlap: z.number().int(),
  shared_events: z.number().int(),
});

export const eventSchema = z.object({
  id: z.string(),
  name: z.string(),
  venue: z.string().nullable(),
  starts_at: z.string(),
  url: z.string().nullable(),
  source: z.string(),
  dj_id: z.string().nullable(),
  dj_name: z.string().nullable(),
  region: z.string().nullable(),
  is_dj_event: z.boolean().optional(),
  archive_url: z.string().nullish(),
});

export const venueSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  url: z.string().nullable(),
  region: z.string().nullable(),
});

export const linkSchema = z.object({
  id: z.string(),
  dj_id: z.string(),
  type: z.string(),
  url: z.string(),
  label: z.string().nullable(),
  created_at: z.string().nullable(),
  helpful: z.number().int(),
  unhelpful: z.number().int(),
  followers: z.number().int(),
  archive_url: z.string().nullish(),
  track_count: z.number().int(),
});

export const mixSchema = z.object({
  id: z.string(),
  dj_id: z.string(),
  title: z.string(),
  url: z.string(),
  platform: z.string(),
  kind: z.enum(['mix', 'interview']),
});

export const articleSchema = z.object({
  id: z.string(),
  dj_id: z.string(),
  title: z.string(),
  url: z.string(),
  source: z.string().nullable(),
  published_at: z.string().nullable(),
  snippet: z.string().nullable(),
  archive_url: z.string().nullish(),
});

export const collabSchema = z.object({
  name: z.string(),
  dj_id: z.string().nullable(),
  count: z.number().int(),
});

export const labelSchema = z.object({
  name: z.string(),
  count: z.number().int(),
});

export const metaSchema = z.object({
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const listResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: metaSchema,
  });

export const djListResponseSchema = listResponseSchema(djSummarySchema);
export const eventListResponseSchema = listResponseSchema(eventSchema);
export const venueListResponseSchema = z.object({ data: z.array(venueSchema) });

export const djDetailSchema = djSummarySchema.extend({
  summary: z.string(),
  links: z.array(linkSchema),
  mixes: z.array(mixSchema),
  articles: z.array(articleSchema),
  collabs: z.array(collabSchema),
  labels: z.array(labelSchema),
  similar: z.array(similarDjSchema),
  upcoming_gigs: z.array(eventSchema),
  past_gigs: z.array(eventSchema),
});

export const datasetExportSchema = z.object({
  exportedAt: z.string(),
  version: z.string(),
  djs: z.array(djRowSchema),
  events: z.array(eventSchema),
  venues: z.array(venueSchema),
  links: z.array(linkSchema),
  articles: z.array(articleSchema),
  mixes: z.array(mixSchema),
});

export const datasetMetaSchema = z.object({
  version: z.string(),
  exportedAt: z.string(),
  counts: z.object({
    djs: z.number().int(),
    events: z.number().int(),
    venues: z.number().int(),
    links: z.number().int(),
    articles: z.number().int(),
    mixes: z.number().int(),
  }),
  license: z.string(),
  sources: z.array(z.string()),
});

// Query params — validated at the route boundary. Defaults mirror the
// previous hand-rolled parsing so existing callers keep working.
export const djListQuerySchema = z.object({
  q: z.string().optional(),
  genre: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const eventListQuerySchema = z.object({
  upcoming: z.string().optional(),
  venue: z.string().optional(),
  dj: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1),
});

// Convert a Zod schema to an OpenAPI 3.1 JSON Schema component.
export function schemaToOpenApi(schema: z.ZodType): JsonObject {
  const json = schema.toJSONSchema() as JsonObject;
  delete json.$schema;
  return json;
}
