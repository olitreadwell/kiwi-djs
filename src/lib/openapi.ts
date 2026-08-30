import type { JsonObject } from 'type-fest';
import {
  articleSchema,
  collabSchema,
  datasetExportSchema,
  datasetMetaSchema,
  djDetailSchema,
  djListResponseSchema,
  djSummarySchema,
  eventListResponseSchema,
  eventSchema,
  labelSchema,
  linkSchema,
  metaSchema,
  mixSchema,
  schemaToOpenApi,
  venueListResponseSchema,
  venueSchema,
} from './schemas';

export const openApiSpec: JsonObject = {
  openapi: '3.1.0',
  info: {
    title: 'Kiwi DJs API',
    description:
      'Open dataset of New Zealand (Aotearoa) DJs: profiles, mixes, news, gigs, venues. Public data only. Opt-out respected.',
    version: '1.0.0',
    license: { name: 'MIT' },
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'djs', description: 'DJ profiles and dossiers' },
    { name: 'events', description: 'Gigs and events' },
    { name: 'venues', description: 'Venues' },
    { name: 'dataset', description: 'Full dataset export' },
  ],
  paths: {
    '/djs': {
      get: {
        tags: ['djs'],
        summary: 'List DJs',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search name/bio/genres' },
          { name: 'genre', in: 'query', schema: { type: 'string' }, description: 'Filter by genre' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': {
            description: 'List of DJ summaries',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DjListResponse' },
              },
            },
          },
        },
      },
    },
    '/djs/{id}': {
      get: {
        tags: ['djs'],
        summary: 'Get DJ dossier',
        description: 'Full profile: summary, mixes, articles, socials, collabs, labels, similar DJs, upcoming and past gigs.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'DJ dossier', content: { 'application/json': { schema: { $ref: '#/components/schemas/DjDetail' } } } },
          '404': { description: 'DJ not found' },
        },
      },
    },
    '/events': {
      get: {
        tags: ['events'],
        summary: 'List events',
        parameters: [
          { name: 'upcoming', in: 'query', schema: { type: 'boolean', default: true } },
          { name: 'venue', in: 'query', schema: { type: 'string' } },
          { name: 'dj', in: 'query', schema: { type: 'string' }, description: 'DJ id' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
        ],
        responses: {
          '200': { description: 'List of events', content: { 'application/json': { schema: { $ref: '#/components/schemas/EventListResponse' } } } },
        },
      },
    },
    '/venues': {
      get: {
        tags: ['venues'],
        summary: 'List venues',
        responses: {
          '200': { description: 'List of venues', content: { 'application/json': { schema: { $ref: '#/components/schemas/VenueListResponse' } } } },
        },
      },
    },
    '/search': {
      get: {
        tags: ['djs'],
        summary: 'Search DJs',
        parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Search results', content: { 'application/json': { schema: { $ref: '#/components/schemas/DjListResponse' } } } },
        },
      },
    },
    '/dataset': {
      get: {
        tags: ['dataset'],
        summary: 'Full dataset export',
        description: 'Complete snapshot: DJs, events, venues, links, articles, mixes. For reuse in other products.',
        responses: {
          '200': { description: 'Full dataset', content: { 'application/json': { schema: { $ref: '#/components/schemas/DatasetExport' } } } },
        },
      },
    },
    '/dataset.csv': {
      get: {
        tags: ['dataset'],
        summary: 'DJs as CSV',
        responses: {
          '200': { description: 'CSV of DJs', content: { 'text/csv': { schema: { type: 'string' } } } },
        },
      },
    },
    '/dataset/meta': {
      get: {
        tags: ['dataset'],
        summary: 'Dataset metadata',
        description: 'Version, generated-at, counts, license and sources for the dataset export.',
        responses: {
          '200': { description: 'Dataset metadata', content: { 'application/json': { schema: { $ref: '#/components/schemas/DatasetMeta' } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      DjSummary: schemaToOpenApi(djSummarySchema),
      DjListResponse: schemaToOpenApi(djListResponseSchema),
      DjDetail: schemaToOpenApi(djDetailSchema),
      Event: schemaToOpenApi(eventSchema),
      EventListResponse: schemaToOpenApi(eventListResponseSchema),
      Venue: schemaToOpenApi(venueSchema),
      VenueListResponse: schemaToOpenApi(venueListResponseSchema),
      Link: schemaToOpenApi(linkSchema),
      Mix: schemaToOpenApi(mixSchema),
      Article: schemaToOpenApi(articleSchema),
      Collab: schemaToOpenApi(collabSchema),
      Label: schemaToOpenApi(labelSchema),
      Meta: schemaToOpenApi(metaSchema),
      DatasetExport: schemaToOpenApi(datasetExportSchema),
      DatasetMeta: schemaToOpenApi(datasetMetaSchema),
    },
  },
};
