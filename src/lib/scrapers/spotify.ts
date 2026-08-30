// Spotify-based NZ EDM discovery. Spotify is the only free source that
// satisfies the source-priority policy (#301): genre filter (search +
// artist genres), location (country charts), and popularity/follower
// sorting — all in one API. Runs only when SPOTIFY_CLIENT_ID + SECRET are
// set (client credentials, free tier); otherwise errors cleanly so the
// loop surfaces the credential gap instead of silently finding nothing.
import type { Pool } from 'pg';
import { sleep } from './http';
import { upsertDjLink } from './links';
import { normaliseGenres } from '../genres';
import { slugify } from '../slug';
import { isEventSeriesName, isJunkName, loadExistingNames, normalizeArtistName } from './discover';
import type { ScrapeResult } from './types';

// "Top 50 – New Zealand" country chart: NZ-grounded and play-ranked.
const NZ_TOP_50_ID = '37i9dQZEVXbMxjQ1yZv4hZ';

const EDM_GENRES = new Set([
  'House', 'Deep House', 'Tech House', 'Progressive House', 'Acid House', 'Melodic House & Techno',
  'Techno', 'Hard Techno', 'Minimal Techno', 'Melodic Techno', 'Acid Techno', 'Detroit Techno',
  'Trance', 'Psytrance', 'Goa Trance', 'Drum and Bass', 'Liquid Drum and Bass', 'Liquid Funk',
  'Neurofunk', 'Jungle', 'Garage', 'UK Garage', '2-Step', 'Grime', 'Dubstep', 'Deep Dubstep',
  'Breaks', 'Electro', 'Bass', 'Bass Music', 'Bass House', 'Disco', 'Nu-Disco', 'Afro House',
  'Afrobeats', 'Amapiano', 'Gqom', 'Synthwave', 'Hardcore', 'Hardstyle', 'Happy Hardcore',
  'Gabber', 'Dance', 'Electronic', 'Dance-Pop',
]);

interface SpotifyArtist {
  id: string;
  name: string;
  popularity: number;
  followers: { total: number };
  genres: string[];
  external_urls?: { spotify?: string };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

async function spotifyJson(token: string, url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export async function discoverSpotifyNzEdm(pool: Pool): Promise<ScrapeResult> {
  const token = await getToken();
  if (!token) {
    return { status: 'error', items_found: 0, items_new: 0, error: 'no Spotify credentials (set SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET)' };
  }
  // NZ Top 50 chart → artist ids (chart position = play ranking).
  const chart = (await spotifyJson(
    token,
    `https://api.spotify.com/v1/playlists/${NZ_TOP_50_ID}/tracks?limit=50`,
  )) as { items?: Array<{ track?: { artists?: Array<{ id: string; name: string }> } }> } | null;
  const chartArtists = new Map<string, string>();
  for (const item of chart?.items ?? []) {
    for (const artist of item.track?.artists ?? []) {
      if (artist.id && !chartArtists.has(artist.id)) chartArtists.set(artist.id, artist.name);
    }
  }
  if (chartArtists.size === 0) {
    return { status: 'error', items_found: 0, items_new: 0, error: 'Spotify NZ Top 50 chart returned no artists' };
  }
  // Full artist objects (genres, followers, popularity) in one batch call.
  const ids = [...chartArtists.keys()].slice(0, 50);
  const artistsResponse = (await spotifyJson(
    token,
    `https://api.spotify.com/v1/artists?ids=${ids.join(',')}`,
  )) as { artists?: SpotifyArtist[] } | null;
  const artists = (artistsResponse?.artists ?? [])
    .filter((artist) => artist.name && artist.genres.some((genre) => EDM_GENRES.has(normaliseGenres([genre])[0] ?? genre)))
    .sort((a, b) => b.followers.total - a.followers.total);

  const existing = await loadExistingNames(pool);
  let found = 0;
  let newCount = 0;
  for (const artist of artists) {
    if (isJunkName(artist.name) || isEventSeriesName(artist.name)) continue;
    const key = normalizeArtistName(artist.name);
    if (existing.has(key)) continue;
    existing.add(key);
    const id = slugify(artist.name);
    const genres = normaliseGenres(artist.genres).filter((genre) => EDM_GENRES.has(genre));
    const spotifyUrl = artist.external_urls?.spotify ?? `https://open.spotify.com/artist/${artist.id}`;
    const result = await pool.query(
      `INSERT INTO djs (id, name, source, active, data_completeness, verification_level, verification_sources,
                        is_nz, popularity, genres, discovery_note)
       VALUES ($1, $2, 'discovered-spotify', TRUE, 30, 2, ARRAY['links'], TRUE, $3, $4, NULL)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, artist.name, artist.popularity, genres],
    );
    if (result.rows.length === 0) continue;
    newCount += 1;
    await upsertDjLink(pool, id, 'spotify', spotifyUrl, `Spotify: ${artist.name}`, artist.followers.total, artist.popularity);
    found += 1;
  }
  await sleep(500);
  return {
    status: found > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: newCount,
    error: found === 0 ? 'No new NZ EDM artists from Spotify chart' : undefined,
  };
}
