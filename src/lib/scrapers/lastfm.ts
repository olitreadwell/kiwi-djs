// Last.fm discovery: the geo.gettopartists endpoint ranks NZ artists by
// playcount, which satisfies the source-priority policy (#301) — location
// filter (country=New+Zealand) + popularity sort (playcount) in one call.
// Genre tags come from artist.getTopTags. Runs only when LASTFM_API_KEY is
// set; otherwise errors cleanly so the loop surfaces the credential gap.
import type { Pool } from 'pg';
import { sleep } from './http';
import { upsertDjLink } from './links';
import { normaliseGenres } from '../genres';
import { slugify } from '../slug';
import { isEventSeriesName, isJunkName, loadExistingNames, normalizeArtistName } from './discover';
import type { ScrapeResult } from './types';

const API = 'https://ws.audioscrobbler.com/2.0/';

// Canonical genre spellings (post-normaliseGenres) that count as electronic
// enough to keep a Last.fm artist in the NZ list.
const KNOWN_ELECTRONIC_GENRES = new Set([
  'Drum and Bass', 'Liquid Drum and Bass', 'Liquid Funk', 'Neurofunk', 'Jungle',
  'House', 'Deep House', 'Tech House', 'Progressive House', 'Acid House', 'Melodic House & Techno',
  'Techno', 'Hard Techno', 'Minimal Techno', 'Melodic Techno', 'Acid Techno', 'Detroit Techno',
  'Trance', 'Psytrance', 'Goa Trance', 'Garage', 'UK Garage', '2-Step', 'Grime', 'Dubstep',
  'Breaks', 'Electro', 'Disco', 'Nu-Disco', 'Afro House', 'Afrobeats', 'Amapiano',
  'Synthwave', 'Hardcore', 'Hardstyle', 'Electronic', 'Dance', 'Downtempo', 'Ambient', 'IDM',
]);

async function lastfmJson(key: string, params: Record<string, string>): Promise<unknown | null> {
  try {
    const query = new URLSearchParams({ api_key: key, format: 'json', ...params });
    const res = await fetch(`${API}?${query}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

interface LastfmArtist {
  name: string;
  playcount: string;
  url: string;
}

export async function discoverLastfmNz(pool: Pool): Promise<ScrapeResult> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) {
    return { status: 'error', items_found: 0, items_new: 0, error: 'no Last.fm credentials (set LASTFM_API_KEY)' };
  }
  const top = (await lastfmJson(key, { method: 'geo.gettopartists', country: 'New Zealand', limit: '50' })) as
    | { topartists?: { artist?: LastfmArtist[] } }
    | null;
  const artists = (top?.topartists?.artist ?? []).filter((artist) => artist.name);
  if (artists.length === 0) {
    return { status: 'error', items_found: 0, items_new: 0, error: 'Last.fm NZ top artists returned nothing' };
  }

  const existing = await loadExistingNames(pool);
  let found = 0;
  let newCount = 0;
  for (const artist of artists.slice(0, 15)) {
    try {
      if (isJunkName(artist.name) || isEventSeriesName(artist.name)) continue;
      const keyName = normalizeArtistName(artist.name);
      if (existing.has(keyName)) continue;

      const tags = (await lastfmJson(key, { method: 'artist.getTopTags', artist: artist.name })) as
        | { toptags?: { tag?: Array<{ name: string }> } }
        | null;
      const rawTags = (tags?.toptags?.tag ?? []).map((tag) => tag.name);
      const genres = normaliseGenres(rawTags).filter((genre) => KNOWN_ELECTRONIC_GENRES.has(genre)).slice(0, 8);
      if (genres.length === 0) continue;

      existing.add(keyName);
      const id = slugify(artist.name);
      const playcount = parseInt(artist.playcount, 10) || 0;
      const result = await pool.query(
        `INSERT INTO djs (id, name, source, active, data_completeness, verification_level, verification_sources,
                          is_nz, popularity, genres, discovery_note)
         VALUES ($1, $2, 'discovered-lastfm', TRUE, 30, 2, ARRAY['links'], TRUE, $3, $4, NULL)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, artist.name, playcount, genres],
      );
      if (result.rows.length === 0) continue;
      newCount += 1;
      await upsertDjLink(pool, id, 'last.fm', artist.url, `Last.fm: ${artist.name}`, playcount, 0);
      found += 1;
    } catch (err) {
      console.log(`  discover-lastfm-nz: ${artist.name} → error (${err instanceof Error ? err.message : String(err)})`);
    }
    await sleep(500);
  }
  return {
    status: found > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: newCount,
    error: found === 0 ? 'No new NZ electronic artists from Last.fm' : undefined,
  };
}
