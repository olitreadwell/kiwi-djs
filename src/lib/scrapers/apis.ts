import type { Pool } from 'pg';
import { get as httpsGet } from 'node:https';
import { sleep } from './http';
import { upsertDjLink } from './links';
import type { ScrapeResult } from './types';

interface DjRow {
  id: string;
  name: string;
}

// Keyless public APIs: MusicBrainz, iTunes Search, Nominatim (OSM).
// All three require a descriptive User-Agent and ~1 req/s politeness.
const API_UA = 'WellingtonDJsBot/1.0 (https://github.com/olitreadwell/nz-djs; data enrichment)';

// MusicBrainz only answers reliably over IPv4 from this network; node's
// fetch hangs on their IPv6 address, so use https with family 4 here.
function fetchJson(url: string, family: 4 | 6 = 4): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = httpsGet(
      url,
      { headers: { 'user-agent': API_UA, accept: 'application/json' }, family, timeout: 15000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${url}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Invalid JSON from ${url}`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Timeout: ${url}`)));
    req.on('error', reject);
  });
}

interface MusicbrainzArtist {
  id: string;
  name: string;
  aliases?: Array<{ name: string }>;
  genres?: Array<{ name: string }>;
  relations?: Array<{ type: string; url?: { resource: string } }>;
}

function nameMatches(query: string, candidate: string): boolean {
  const a = query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const b = candidate.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return a.length > 0 && (a.includes(b) || b.includes(a));
}

async function musicbrainzSearch(name: string): Promise<MusicbrainzArtist | null> {
  const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=5`;
  const data = (await fetchJson(url)) as { artists?: MusicbrainzArtist[] };
  const artists = (data.artists ?? []).filter((artist) => nameMatches(name, artist.name));
  return artists[0] ?? null;
}

async function musicbrainzLookup(mbid: string): Promise<MusicbrainzArtist | null> {
  const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels+aliases+genres&fmt=json`;
  return (await fetchJson(url)) as MusicbrainzArtist;
}

// Map MusicBrainz URL relation types to dj_links types + djs columns.
const MB_LINK_TYPES: Record<string, string> = {
  bandcamp: 'bandcamp',
  'resident advisor': 'resident-advisor',
  'official homepage': 'website',
  soundcloud: 'soundcloud',
  instagram: 'instagram',
  facebook: 'facebook',
  twitter: 'twitter',
  spotify: 'spotify',
  youtube: 'youtube',
  discogs: 'discogs',
};

const MB_COLUMN_TYPES: Record<string, string> = {
  soundcloud: 'soundcloud_url',
  instagram: 'instagram_url',
  facebook: 'facebook_url',
  website: 'website_url',
};

export async function enrichMusicbrainz(pool: Pool, dj: DjRow): Promise<ScrapeResult> {
  const artist = await musicbrainzSearch(dj.name);
  if (!artist) {
    return { status: 'partial', items_found: 0, items_new: 0, error: 'No MusicBrainz match' };
  }
  await sleep(1000);
  const full = await musicbrainzLookup(artist.id);
  if (!full) return { status: 'partial', items_found: 0, items_new: 0, error: 'MusicBrainz lookup empty' };

  let found = 0;
  for (const alias of full.aliases ?? []) {
    const name = alias.name.trim();
    if (!name || name.toLowerCase() === dj.name.toLowerCase()) continue;
    await pool.query(`INSERT INTO dj_aliases (dj_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [dj.id, name]);
    found += 1;
  }

  const genres = new Set<string>();
  for (const genre of full.genres ?? []) {
    const name = genre.name.trim();
    if (name) genres.add(name);
  }
  if (genres.size > 0) {
    await pool.query(
      `UPDATE djs SET genres = (SELECT array_agg(DISTINCT g) FROM unnest(genres || $2::text[]) AS g) WHERE id = $1`,
      [dj.id, [...genres]],
    );
    found += genres.size;
  }

  for (const relation of full.relations ?? []) {
    const resource = relation.url?.resource;
    if (!resource) continue;
    const type = MB_LINK_TYPES[relation.type.toLowerCase()] ?? relation.type.toLowerCase();
    await upsertDjLink(pool, dj.id, type, resource, `${relation.type}: ${resource}`);
    const column = MB_COLUMN_TYPES[type];
    if (column) {
      await pool.query(`UPDATE djs SET ${column} = COALESCE(${column}, $2) WHERE id = $1`, [dj.id, resource]);
    }
    found += 1;
  }

  return {
    status: found > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: 0,
    error: found === 0 ? 'No aliases/links/genres found' : undefined,
  };
}

interface ItunesArtist {
  artistName: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
}

export async function enrichItunes(pool: Pool, dj: DjRow): Promise<ScrapeResult> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(dj.name)}&entity=musicArtist&limit=5&country=NZ`;
  const res = await fetch(url, {
    headers: { 'user-agent': API_UA, accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
  const data = (await res.json()) as { results?: ItunesArtist[] };
  const artist = (data.results ?? []).find((result) => nameMatches(dj.name, result.artistName));
  if (!artist) {
    return { status: 'partial', items_found: 0, items_new: 0, error: 'No iTunes match' };
  }

  let found = 0;
  if (artist.artworkUrl100) {
    const image = artist.artworkUrl100.replace('100x100', '300x300');
    await pool.query(`UPDATE djs SET image_url = COALESCE(image_url, $2) WHERE id = $1`, [dj.id, image]);
    found += 1;
  }
  if (artist.primaryGenreName) {
    await pool.query(
      `UPDATE djs SET genres = (SELECT array_agg(DISTINCT g) FROM unnest(genres || $2::text[]) AS g) WHERE id = $1`,
      [dj.id, [artist.primaryGenreName]],
    );
    found += 1;
  }
  return {
    status: found > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: 0,
    error: found === 0 ? 'No image/genre found' : undefined,
  };
}

interface NominatimResult {
  state?: string;
  city?: string;
  address?: { state?: string; region?: string; city?: string };
}

// Geocode venue addresses to NZ regions (Wellington, Auckland, Canterbury, ...)
// so events can be filtered by region. Keyless; 1 req/s + UA required.
export async function enrichVenueRegions(pool: Pool): Promise<ScrapeResult> {
  const venues = (
    await pool.query(`SELECT id, name, address FROM venues WHERE address IS NOT NULL AND (region IS NULL OR region = '')`)
  ).rows as Array<{ id: string; name: string; address: string }>;
  let found = 0;
  for (const venue of venues) {
    const query = `${venue.address}, New Zealand`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=nz&addressdetails=1`;
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': API_UA, accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
      const results = (await res.json()) as NominatimResult[];
      const region = results[0]?.address?.state ?? results[0]?.address?.region ?? results[0]?.address?.city;
      if (region) {
        await pool.query(`UPDATE venues SET region = $2 WHERE id = $1`, [venue.id, region]);
        found += 1;
      }
    } catch (err) {
      console.log(`  enrich-venue-regions: ${venue.name} → error (${err instanceof Error ? err.message : String(err)})`);
    }
    await sleep(1000);
  }
  return {
    status: venues.length === 0 ? 'partial' : found > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: 0,
    error: venues.length === 0 ? 'No venues awaiting geocoding' : found === 0 ? 'No regions resolved' : undefined,
  };
}
