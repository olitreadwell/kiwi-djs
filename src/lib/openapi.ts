import type { JsonObject } from 'type-fest';

export const openApiSpec: JsonObject = {
  openapi: '3.1.0',
  info: {
    title: 'NZ DJs API',
    description:
      'Open dataset of Wellington (Te Whanganui-a-Tara) DJs: profiles, mixes, news, gigs, venues. Public data only. Opt-out respected.',
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
      DjSummary: {
        type: 'object',
        required: ['id', 'name', 'genres', 'popularity', 'data_completeness', 'verification_level', 'verification_sources', 'upcoming_events', 'last_played_at'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          genres: { type: 'array', items: { type: 'string' } },
          bio: { type: 'string', nullable: true },
          image_url: { type: 'string', nullable: true },
          soundcloud_url: { type: 'string', nullable: true },
          instagram_url: { type: 'string', nullable: true },
          facebook_url: { type: 'string', nullable: true },
          mixcloud_url: { type: 'string', nullable: true },
          website_url: { type: 'string', nullable: true },
          popularity: { type: 'integer' },
          data_completeness: { type: 'integer' },
          verification_level: { type: 'integer', description: 'Evidence-weighted: 0 candidate, 1 listed, 2+ verified' },
          verification_sources: { type: 'array', items: { type: 'string' }, description: 'Evidence categories: mixes, links, articles, gigs' },
          upcoming_events: { type: 'integer' },
          last_played_at: { type: 'string', format: 'date-time', nullable: true, description: 'Most recent past gig date' },
        },
      },
      DjListResponse: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/DjSummary' } },
          meta: { $ref: '#/components/schemas/Meta' },
        },
      },
      DjDetail: {
        type: 'object',
        required: ['id', 'name', 'genres', 'summary', 'links', 'mixes', 'articles', 'collabs', 'labels', 'similar', 'upcoming_gigs', 'past_gigs'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          genres: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
          links: { type: 'array', items: { $ref: '#/components/schemas/Link' } },
          mixes: { type: 'array', items: { $ref: '#/components/schemas/Mix' } },
          articles: { type: 'array', items: { $ref: '#/components/schemas/Article' } },
          collabs: { type: 'array', items: { $ref: '#/components/schemas/Collab' } },
          labels: { type: 'array', items: { $ref: '#/components/schemas/Label' } },
          similar: { type: 'array', items: { $ref: '#/components/schemas/DjSummary' } },
          upcoming_gigs: { type: 'array', items: { $ref: '#/components/schemas/Event' } },
          past_gigs: { type: 'array', items: { $ref: '#/components/schemas/Event' } },
        },
      },
      Event: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          venue: { type: 'string', nullable: true },
          starts_at: { type: 'string', format: 'date-time', nullable: true },
          url: { type: 'string', nullable: true },
          source: { type: 'string' },
          dj_id: { type: 'string', nullable: true },
          dj_name: { type: 'string', nullable: true },
        },
      },
      EventListResponse: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Event' } },
          meta: { $ref: '#/components/schemas/Meta' },
        },
      },
      Venue: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          address: { type: 'string', nullable: true },
          url: { type: 'string', nullable: true },
        },
      },
      VenueListResponse: {
        type: 'object',
        required: ['data'],
        properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Venue' } } },
      },
      Link: {
        type: 'object',
        required: ['id', 'type', 'url'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          url: { type: 'string' },
          label: { type: 'string', nullable: true },
        },
      },
      Mix: {
        type: 'object',
        required: ['id', 'platform', 'title', 'url'],
        properties: {
          id: { type: 'string' },
          platform: { type: 'string', enum: ['soundcloud', 'mixcloud'] },
          title: { type: 'string' },
          url: { type: 'string' },
        },
      },
      Article: {
        type: 'object',
        required: ['id', 'title', 'url'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          url: { type: 'string' },
          source: { type: 'string', nullable: true },
          published_at: { type: 'string', format: 'date-time', nullable: true },
          snippet: { type: 'string', nullable: true },
        },
      },
      Collab: {
        type: 'object',
        required: ['name', 'count'],
        properties: {
          name: { type: 'string' },
          dj_id: { type: 'string', nullable: true },
          count: { type: 'integer' },
        },
      },
      Label: {
        type: 'object',
        required: ['name', 'count'],
        properties: {
          name: { type: 'string' },
          count: { type: 'integer' },
        },
      },
      Meta: {
        type: 'object',
        required: ['total', 'limit', 'offset'],
        properties: {
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
      DatasetExport: {
        type: 'object',
        required: ['exportedAt', 'version', 'djs', 'events', 'venues', 'links', 'articles', 'mixes'],
        properties: {
          exportedAt: { type: 'string', format: 'date-time' },
          version: { type: 'string', description: 'Stable content hash; changes on regeneration' },
          djs: { type: 'array', items: { $ref: '#/components/schemas/DjSummary' } },
          events: { type: 'array', items: { $ref: '#/components/schemas/Event' } },
          venues: { type: 'array', items: { $ref: '#/components/schemas/Venue' } },
          links: { type: 'array', items: { $ref: '#/components/schemas/Link' } },
          articles: { type: 'array', items: { $ref: '#/components/schemas/Article' } },
          mixes: { type: 'array', items: { $ref: '#/components/schemas/Mix' } },
        },
      },
      DatasetMeta: {
        type: 'object',
        required: ['version', 'exportedAt', 'counts', 'license', 'sources'],
        properties: {
          version: { type: 'string' },
          exportedAt: { type: 'string', format: 'date-time' },
          counts: {
            type: 'object',
            required: ['djs', 'events', 'venues', 'links', 'articles', 'mixes'],
            properties: {
              djs: { type: 'integer' },
              events: { type: 'integer' },
              venues: { type: 'integer' },
              links: { type: 'integer' },
              articles: { type: 'integer' },
              mixes: { type: 'integer' },
            },
          },
          license: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};
