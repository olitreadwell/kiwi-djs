import type { Pool } from 'pg';
import { get as httpsGet } from 'node:https';
import { sleep } from './http';
import { upsertDjLink } from './links';
import { normaliseGenres } from '../genres';
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

// Classify a MusicBrainz relation URL by its host so social profiles get
// specific platform types (Instagram, X, Facebook...) instead of the generic
// "social network" bucket.
const HOST_TO_TYPE: Array<[RegExp, string]> = [
  [/instagram\.com/i, 'instagram'],
  [/twitter\.com|x\.com/i, 'twitter'],
  [/facebook\.com|fb\.com/i, 'facebook'],
  [/tiktok\.com/i, 'tiktok'],
  [/youtu\.?be|music\.youtube/i, 'youtube'],
  [/mixcloud\.com/i, 'mixcloud'],
  [/soundcloud\.com/i, 'soundcloud'],
  [/spotify\.com/i, 'spotify'],
  [/bandcamp\.com/i, 'bandcamp'],
  [/residentadvisor\.net|ra\.co/i, 'resident-advisor'],
  [/mastodon/i, 'mastodon'],
  [/threads\.net/i, 'threads'],
  [/myspace\.com/i, 'myspace'],
  [/last\.fm/i, 'last.fm'],
  [/snapchat\.com/i, 'snapchat'],
  [/twitch\.tv/i, 'twitch'],
  [/songkick\.com/i, 'songkick'],
  [/beatport\.com/i, 'beatport'],
  [/music\.apple\.com/i, 'apple-music'],
  [/tidal\.com/i, 'tidal'],
  [/deezer\.com/i, 'deezer'],
  [/qobuz\.com/i, 'qobuz'],
];

function classifyLinkType(relationType: string, resource: string): string {
  for (const [pattern, type] of HOST_TO_TYPE) {
    if (pattern.test(resource)) return type;
  }
  return MB_LINK_TYPES[relationType.toLowerCase()] ?? relationType.toLowerCase();
}

const MB_COLUMN_TYPES: Record<string, string> = {
  soundcloud: 'soundcloud_url',
  instagram: 'instagram_url',
  facebook: 'facebook_url',
  website: 'website_url',
};

// Auto-generated SoundCloud accounts carry a numeric suffix ("user-123456"
// or "name-284744466") and are usually secondary or low-activity. A clean
// permalink is the primary profile — prefer it as the canonical link (#304).
function isCleanSoundcloudPermalink(url: string): boolean {
  const match = url.match(/soundcloud\.com\/([^/?#]+)/);
  if (!match) return false;
  const permalink = match[1];
  return !/user-\d+$/.test(permalink) && !/-\d+$/.test(permalink);
}

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
    const normalised = normaliseGenres([...genres]);
    await pool.query(
      `UPDATE djs SET genres = (SELECT array_agg(g) FROM (SELECT DISTINCT g FROM unnest(genres || $2::text[]) AS g LIMIT 8) t) WHERE id = $1`,
      [dj.id, normalised],
    );
    found += normalised.length;
  }

  for (const relation of full.relations ?? []) {
    const resource = relation.url?.resource;
    if (!resource) continue;
    const type = classifyLinkType(relation.type, resource);
    await upsertDjLink(pool, dj.id, type, resource);
    const column = MB_COLUMN_TYPES[type];
    if (column) {
      if (column === 'soundcloud_url') {
        const existing = (await pool.query(`SELECT soundcloud_url FROM djs WHERE id = $1`, [dj.id])).rows[0]
          ?.soundcloud_url as string | undefined;
        if (!existing || (!isCleanSoundcloudPermalink(existing) && isCleanSoundcloudPermalink(resource))) {
          await pool.query(`UPDATE djs SET soundcloud_url = $2 WHERE id = $1`, [dj.id, resource]);
        }
      } else {
        await pool.query(`UPDATE djs SET ${column} = COALESCE(${column}, $2) WHERE id = $1`, [dj.id, resource]);
      }
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
    const normalised = normaliseGenres([artist.primaryGenreName]);
    await pool.query(
      `UPDATE djs SET genres = (SELECT array_agg(g) FROM (SELECT DISTINCT g FROM unnest(genres || $2::text[]) AS g LIMIT 8) t) WHERE id = $1`,
      [dj.id, normalised],
    );
    found += normalised.length;
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

// --- Bio ("about section") enrichment (#296) ---
// Pull a real description for DJs that lack one, starting with the most
// popular. Sources in order: Wikipedia via the MusicBrainz URL relation
// (authoritative mapping), Wikipedia search (strict relevance so a namesake
// like a cartoonist never becomes a DJ bio), then the Mixcloud biography.
// Bandcamp bios are handled by enrichBandcamp.

interface WikipediaPage {
  title: string;
  extract?: string;
}

async function wikipediaIntro(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
  const data = (await fetchJson(url)) as { query?: { pages?: Record<string, WikipediaPage> } };
  const page = Object.values(data.query?.pages ?? {})[0];
  const extract = page?.extract?.trim();
  // Collapse paragraph breaks to a single line — multi-line bios break the
  // CSV export's line count and render awkwardly on cards.
  return extract ? extract.replace(/\s+/g, ' ').trim().slice(0, 2000) : null;
}

function wikipediaTitleFromUrl(resource: string): string | null {
  const match = resource.match(/wikipedia\.org\/wiki\/(.+)$/);
  return match ? decodeURIComponent(match[1].replace(/_/g, ' ')) : null;
}

// Strict relevance for any Wikipedia bio: the page must mention the DJ name
// and a New Zealand signal (country or NZ city), and read like a music act —
// never an album, a namesake (cartoonist, model, footballer) or a foreign
// act that merely toured NZ.
const NZ_SIGNAL = /\bnew zealand\b|aotearoa|\bnz\b|auckland|wellington|christchurch|dunedin|hamilton|tauranga|queenstown|nelson|napier|rotorua|palmerston north|new plymouth|whanganui|gisborne|timaru|invercargill|whangarei|hastings|lower hutt|upper hutt|porirua|taupo|wanaka|blenheim|waiheke/i;

function wikipediaExtractIsRelevant(djName: string, title: string, extract: string): boolean {
  const haystack = `${title} ${extract}`.toLowerCase();
  const name = djName.toLowerCase();
  if (!haystack.includes(name)) return false;
  if (!NZ_SIGNAL.test(haystack)) return false;
  if (/\balbum by\b|\bis (?:the |a |an )?(?:debut |self-titled |eponymous )?(?:studio |compilation |live )?album\b|\brecord label\b|\bimprint\b|\bcompany\b|\bbusiness\b|\bbrand\b/i.test(haystack)) return false;
  return /\b(dj|deejay|disc jockey|musician|band|singer|songwriter|producer|rapper|group|drum and bass|dnb|electronic music|house music|techno|reggae|dub)\b/i.test(haystack);
}

export async function enrichBio(pool: Pool, dj: DjRow): Promise<ScrapeResult> {
  const existing = (await pool.query('SELECT bio FROM djs WHERE id = $1', [dj.id])).rows[0]?.bio as string | undefined;
  if (existing) return { status: 'partial', items_found: 0, items_new: 0, error: 'Bio already present' };

  // 1) Wikipedia via the MusicBrainz URL relation (authoritative).
  try {
    const artist = await musicbrainzSearch(dj.name);
    if (artist) {
      await sleep(1000);
      const full = await musicbrainzLookup(artist.id);
      const wikiRelation = (full?.relations ?? []).find((relation) => relation.type === 'wikipedia');
      const wikiTitle = wikiRelation?.url?.resource ? wikipediaTitleFromUrl(wikiRelation.url.resource) : null;
      if (wikiTitle) {
        const bio = await wikipediaIntro(wikiTitle);
        if (bio && wikipediaExtractIsRelevant(dj.name, wikiTitle, bio)) {
          await pool.query(`UPDATE djs SET bio = $2 WHERE id = $1`, [dj.id, bio]);
          return { status: 'ok', items_found: 1, items_new: 0 };
        }
      }
    }
  } catch {
    // MusicBrainz 503s under load — fall through to the other sources.
  }

  // 2) Wikipedia search fallback with a strict relevance check.
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(dj.name)}&format=json&srlimit=3`;
  const search = (await fetchJson(searchUrl)) as { query?: { search?: Array<{ title: string }> } };
  for (const hit of search.query?.search ?? []) {
    const bio = await wikipediaIntro(hit.title);
    if (bio && wikipediaExtractIsRelevant(dj.name, hit.title, bio)) {
      await pool.query(`UPDATE djs SET bio = $2 WHERE id = $1`, [dj.id, bio]);
      return { status: 'ok', items_found: 1, items_new: 0 };
    }
  }

  // 3) Mixcloud biography.
  const mixcloud = (await pool.query(`SELECT url FROM dj_links WHERE dj_id = $1 AND type = 'mixcloud' LIMIT 1`, [dj.id])).rows[0]
    ?.url as string | undefined;
  if (mixcloud) {
    const user = mixcloud.replace(/^https?:\/\/(www\.)?mixcloud\.com\//, '').replace(/\/.*$/, '');
    const res = await fetch(`https://api.mixcloud.com/${encodeURIComponent(user)}/`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = (await res.json()) as { biography?: string };
      const bio = (data.biography ?? '').replace(/\s+/g, ' ').trim();
      if (bio) {
        await pool.query(`UPDATE djs SET bio = $2 WHERE id = $1`, [dj.id, bio.slice(0, 2000)]);
        return { status: 'ok', items_found: 1, items_new: 0 };
      }
    }
  }

  return { status: 'partial', items_found: 0, items_new: 0, error: 'No bio source matched' };
}
