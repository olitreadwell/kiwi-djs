import type { Pool } from 'pg';
import { get as httpsGet } from 'node:https';
import { slugify } from '../slug';
import { sleep } from './http';
import { upsertDjLink, upsertDjArticle, parseBingNewsXml } from './enrich';
import { getSoundcloudClientId } from './soundcloud-client';
import { discoverSpotifyNzEdm } from './spotify';
import { cityFromLocation, isNzLocation } from '../locations';
import { normaliseGenres } from '../genres';
import type { ScrapeResult } from './types';

const STOP_WORDS = new Set([
  'album', 'release', 'tour', 'live', 'party', 'night', 'presents', 'present', 'with', 'and', 'wellington',
  'new', 'zealand', 'nz', 'special', 'guest', 'support', 'ep', 'single', 'debut', 'final', 'show', 'gig',
  'san', 'fran', 'meow', 'valhalla', 'caroline', 'ivy', 'bar', 'sly', 'deadpool', 'third', 'eye', 'rogue',
  'vagabond', 'moon', 'corner', 'store', 'big', 'fan', 'the', 'of', 'for', 'at', 'in', 'on', 'feat', 'ft',
  'festival', 'quiz', 'tribute', 'fundraiser', 'showcase', 'drag', 'concert', 'opera', 'house', 'embassy',
  'hunter', 'lounge', 'grand', 'laundry', 'old', 'bailey', 'mishmash', 'brewtown', 'green', 'room', 'backyard',
  'thistle', 'wunderbar', 'hotel', 'club', 'tavern', 'hall', 'theatre', 'theater', 'stadium', 'arena',
  'racket', 'malt', 'voices', 'perform', 'music', 'siouxsie', 'banshees', 'anniversary', 'celebration',
]);

const JUNK_NAMES = new Set([
  'dj', 'djs', 'dj set', 'dj sets', 'support', 'opening', 'closing', 'live', 'live set', 'live band',
  'band', 'bands', 'mc', 'host', 'hosts', 'resident', 'residents', 'guest', 'guests', 'special guest',
  'headline', 'headliner', 'opener', 'closer', 'warm up', 'warmup', 'tbc', 'tba', 'to be announced',
  'to be confirmed', 'various artists', 'all night long', 'all night', 'late night', 'early bird',
  'edm music', 'radioactive fm', 'mouthfull radio', 'radio station', 'fm radio', '88.6fm',
]);

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const GENRE_WORDS = [
  'jazz', 'techno', 'house', 'dnb', 'drum and bass', 'drum & bass', 'garage', 'soul', 'funk',
  'reggae', 'dub', 'hip hop', 'hip-hop', 'disco', 'trance', 'ambient', 'breaks', 'electro',
  'rock', 'blues', 'metal', 'pop', 'country', 'folk', 'classical', 'latin', 'afro', 'bass', 'edm', 'dance',
];

// Event series and rigs are not DJs (#27, #19): "Sunday Jazz" is a weekly
// night, "Scorpios Nest Soundsystem" is a rig. Never promote these.
export function isEventSeriesName(name: string): boolean {
  const normalized = normalizeArtistName(name);
  if (/\b(soundsystem|sound system|festival)\b/.test(normalized)) return true;
  const words = normalized.split(' ');
  if (words.length >= 2 && WEEKDAYS.includes(words[0])) {
    const rest = words.slice(1).join(' ');
    return GENRE_WORDS.some((genre) => rest.includes(genre));
  }
  return false;
}

export function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isJunkName(name: string): boolean {
  const normalized = normalizeArtistName(name);
  if (JUNK_NAMES.has(normalized)) return true;
  return [...JUNK_NAMES].some((junk) => normalized === junk || normalized.startsWith(`${junk} `) || normalized.endsWith(` ${junk}`));
}

export function extractArtistNames(eventName: string): string[] {
  const cleaned = eventName
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(presents|presented by|w\/|with|feat\.?|ft\.?)\b/gi, ' | ')
    .replace(/[|,;&/]+/g, ' | ')
    .replace(/\s+[-–—]\s+/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = cleaned.split('|').map((part) => part.trim()).filter(Boolean);
  const names: string[] = [];
  for (const part of parts) {
    const words = part
      .replace(/^[:.\-–—]+/, '')
      .replace(/[:.\-–—]+$/, '')
      .split(' ')
      .filter((word) => !STOP_WORDS.has(word.toLowerCase()));
    if (words.length === 0) continue;
    const name = words.join(' ');
    if (name.length < 3 || name.length > 60) continue;
    if (/\d{4}/.test(name)) continue;
    if (/^\d/.test(name)) continue;
    if (/^(a|an|the|and|of|for|at|in|on)$/i.test(words[words.length - 1])) continue;
    if (words.length === 1 && name.length < 4) continue;
    names.push(name);
  }
  return names;
}

export async function discoverFromEvents(pool: Pool): Promise<ScrapeResult> {
  const events = (await pool.query('SELECT id, name FROM events WHERE dj_id IS NULL')).rows as Array<{ id: string; name: string }>;
  const existing = await loadExistingNames(pool);
  const venueNames = new Set(
    (await pool.query('SELECT name FROM venues')).rows.map((row) => normalizeArtistName(row.name as string)),
  );
  let found = 0;
  let newCount = 0;
  for (const event of events) {
    const names = extractArtistNames(event.name);
    const coBilled = names.length > 1;
    for (const name of names) {
      const key = normalizeArtistName(name);
      if (existing.has(key)) continue;
      if (!coBilled && name.split(' ').length === 1) continue;
      existing.add(key);
      const junk = isJunkName(name) || venueNames.has(key);
      const id = slugify(name);
      const result = await pool.query(
        `INSERT INTO djs (id, name, source, data_completeness, active, discovery_note) VALUES ($1, $2, 'discovered', 10, FALSE, $3)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, name, junk ? 'junk' : null],
      );
      if (result.rows.length > 0) {
        newCount += 1;
        await pool.query(`INSERT INTO dj_aliases (dj_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, key]);
        if (junk) console.log(`  discover-events: junk candidate skipped from promotion: ${name}`);
      }
      found += 1;
    }
  }
  return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: newCount, error: found === 0 ? 'No new names' : undefined };
}

interface SoundcloudUser {
  id: number;
  permalink: string;
  username: string;
  avatar_url?: string;
  city?: string;
  country?: string;
  country_code?: string;
  followers_count?: number;
  track_count?: number;
}

// Seed the list with the strongest NZ signal we can get for free: SoundCloud
// profiles that list New Zealand as their location and have a real
// following. Followers + location + profile link is strong verification.
export async function discoverSoundcloudNz(pool: Pool): Promise<ScrapeResult> {
  const cid = await getSoundcloudClientId();
  if (!cid) return { status: 'error', items_found: 0, items_new: 0, error: 'no SoundCloud client id' };
  const queries = ['new zealand', 'wellington', 'auckland', 'christchurch', 'dunedin', 'queenstown', 'hamilton', 'tauranga'];
  const users = new Map<number, SoundcloudUser>();
  for (const query of queries) {
    try {
      const res = await fetch(`https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(query)}&client_id=${cid}&limit=50`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { collection?: SoundcloudUser[] };
      for (const user of data.collection ?? []) {
        if (user.id) users.set(user.id, user);
      }
    } catch {
      // keep going — one query failing shouldn't kill the city sweep
    }
    await sleep(500);
  }
  const candidates = [...users.values()]
    .filter((u) => isNzLocation(u.city, u.country, u.country_code))
    .filter((u) => (u.followers_count ?? 0) >= 300)
    .filter((u) => (u.track_count ?? 0) > 0)
    .filter((u) => !isJunkName(u.username) && !isEventSeriesName(u.username))
    .sort((a, b) => (b.followers_count ?? 0) - (a.followers_count ?? 0))
    .slice(0, 40);
  const existing = await loadExistingNames(pool);
  let found = 0;
  let newCount = 0;
  for (const user of candidates) {
    const key = normalizeArtistName(user.username);
    if (existing.has(key)) continue;
    existing.add(key);
    const id = slugify(user.username);
    const location = `SoundCloud: ${[user.city, user.country].filter(Boolean).join(', ') || user.country_code || 'NZ'}`;
    const result = await pool.query(
      `INSERT INTO djs (id, name, source, active, data_completeness, verification_level, verification_sources,
                        is_nz, soundcloud_url, image_url, profile_location, city, discovery_note)
       VALUES ($1, $2, 'discovered-soundcloud', TRUE, 25, 2, ARRAY['location','links'], TRUE, $3, $4, $5, $6, NULL)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, user.username, `https://soundcloud.com/${user.permalink}`, user.avatar_url ?? null, location, cityFromLocation(location) ?? 'Wellington'],
    );
    if (result.rows.length === 0) continue;
    newCount += 1;
    await upsertDjLink(pool, id, 'soundcloud', `https://soundcloud.com/${user.permalink}`, `SoundCloud: ${user.username}`, user.followers_count, user.track_count);
    found += 1;
  }
  return {
    status: found > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: newCount,
    error: found === 0 ? 'No new NZ SoundCloud artists' : undefined,
  };
}

// EDM-specific NZ discovery. SoundCloud search can't refine by genre or
// location (returns junk), so the source of truth is MusicBrainz: a
// structured, keyless list of artists tagged electronic/dance with
// area = New Zealand. We then rank the top candidates by SoundCloud
// followers via exact-name lookups (reliable, unlike genre search).
const EDM_GENRES = new Set([
  'House', 'Deep House', 'Tech House', 'Progressive House', 'Acid House', 'Melodic House & Techno',
  'Techno', 'Hard Techno', 'Minimal Techno', 'Melodic Techno', 'Acid Techno', 'Detroit Techno',
  'Trance', 'Psytrance', 'Goa Trance', 'Drum and Bass', 'Liquid Drum and Bass', 'Liquid Funk',
  'Neurofunk', 'Jungle', 'Garage', 'UK Garage', '2-Step', 'Grime', 'Dubstep', 'Deep Dubstep',
  'Breaks', 'Electro', 'Bass', 'Bass Music', 'Bass House', 'Disco', 'Nu-Disco', 'Afro House',
  'Afrobeats', 'Amapiano', 'Gqom', 'Synthwave', 'Hardcore', 'Hardstyle', 'Happy Hardcore',
  'Gabber', 'Dance', 'Electronic',
]);

const MB_TAG_QUERIES = [
  'electronic', 'dance', 'edm', 'house', 'techno', 'drum and bass', 'dubstep',
  'trance', 'garage', 'breaks', 'electro', 'bass',
];

const MB_UA = 'WellingtonDJsBot/1.0 (https://github.com/olitreadwell/nz-djs; discovery)';

// MusicBrainz only answers reliably over IPv4 from this network.
function musicbrainzJson(url: string): Promise<{ count: number; artists: Array<{ id: string; name: string; country?: string; disambiguation?: string; 'begin-area'?: { name?: string }; tags?: Array<{ name: string }> }> }> {
  return new Promise((resolve, reject) => {
    const req = httpsGet(url, { headers: { 'user-agent': MB_UA, accept: 'application/json' }, family: 4, timeout: 15000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`MusicBrainz HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON from MusicBrainz'));
        }
      });
    });
    req.on('error', reject);
  });
}

// Structured NZ EDM discovery: MusicBrainz artists with area = New Zealand
// and an electronic/dance tag. SoundCloud exact-name lookups then attach
// follower counts so we can rank "top" artists.
export async function discoverMusicbrainzNzEdm(pool: Pool): Promise<ScrapeResult> {
  const artists = new Map<string, { name: string; city: string | null; tags: string[] }>();
  for (const tag of MB_TAG_QUERIES) {
    for (const offset of [0, 100]) {
      const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`area:"New Zealand" AND tag:${tag}`)}&fmt=json&limit=100&offset=${offset}`;
      try {
        const data = await musicbrainzJson(url);
        for (const artist of data.artists ?? []) {
          if (!artist.id || !artist.name) continue;
          const tags = (artist.tags ?? []).map((t) => t.name);
          const existing = artists.get(artist.id);
          if (existing) {
            existing.tags = [...new Set([...existing.tags, ...tags])];
          } else {
            artists.set(artist.id, {
              name: artist.name,
              city: artist['begin-area']?.name ?? null,
              tags,
            });
          }
        }
      } catch {
        // keep going — one tag query failing shouldn't kill the sweep
      }
      await sleep(1100); // MusicBrainz rate limit: 1 req/s
    }
  }
  const existing = await loadExistingNames(pool);
  let found = 0;
  let newCount = 0;
  for (const artist of artists.values()) {
    if (isJunkName(artist.name) || isEventSeriesName(artist.name)) continue;
    const genres = normaliseGenres(artist.tags).filter((genre) => EDM_GENRES.has(genre));
    if (genres.length === 0) continue;
    const key = normalizeArtistName(artist.name);
    if (existing.has(key)) continue;
    existing.add(key);
    const id = slugify(artist.name);
    const result = await pool.query(
      `INSERT INTO djs (id, name, source, active, data_completeness, verification_level, verification_sources,
                        is_nz, image_url, profile_location, city, genres, discovery_note)
       VALUES ($1, $2, 'discovered-musicbrainz', TRUE, 25, 2, ARRAY['location'], TRUE, NULL, $3, $4, $5, NULL)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, artist.name, `MusicBrainz: ${artist.city ?? 'New Zealand'}`, artist.city ?? 'Wellington', genres],
    );
    if (result.rows.length === 0) continue;
    newCount += 1;
    found += 1;
  }
  // Attach SoundCloud follower counts to the newest candidates (exact-name
  // search is reliable, unlike genre search) so "top" is rankable.
  const cid = await getSoundcloudClientId();
  if (cid) {
    const candidates = (
      await pool.query(
        `SELECT id, name FROM djs WHERE source = 'discovered-musicbrainz' AND active = TRUE
         AND NOT EXISTS (SELECT 1 FROM dj_links l WHERE l.dj_id = djs.id AND l.type = 'soundcloud')
         ORDER BY created_at DESC LIMIT 30`,
      )
    ).rows as Array<{ id: string; name: string }>;
    for (const candidate of candidates) {
      try {
        const res = await fetch(`https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(candidate.name)}&client_id=${cid}&limit=5`, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) continue;
        const data = (await res.json()) as { collection?: SoundcloudUser[] };
        const match = (data.collection ?? [])
          .filter((u) => normalizeArtistName(u.username) === normalizeArtistName(candidate.name))
          .sort((a, b) => (b.followers_count ?? 0) - (a.followers_count ?? 0))[0];
        if (!match) continue;
        await upsertDjLink(pool, candidate.id, 'soundcloud', `https://soundcloud.com/${match.permalink}`, `SoundCloud: ${match.username}`, match.followers_count, match.track_count);
        await pool.query(`UPDATE djs SET soundcloud_url = $2, image_url = COALESCE(image_url, $3), verification_sources = ARRAY['location','links'] WHERE id = $1`, [
          candidate.id,
          `https://soundcloud.com/${match.permalink}`,
          match.avatar_url ?? null,
        ]);
      } catch {
        // keep going
      }
      await sleep(500);
    }
  }
  return {
    status: found > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: newCount,
    error: found === 0 ? 'No new NZ EDM artists from MusicBrainz' : undefined,
  };
}

export async function loadExistingNames(pool: Pool): Promise<Set<string>> {
  const names = (await pool.query('SELECT lower(name) AS name FROM djs')).rows.map((row) => row.name as string);
  const aliases = (await pool.query('SELECT alias FROM dj_aliases')).rows.map((row) => row.alias as string);
  return new Set([...names, ...aliases].map(normalizeArtistName));
}

interface MixcloudUser {
  name: string;
  url: string;
  city?: string;
}

// Wellington venue/place anchors — a cloudcast mentioning one of these is
// strong evidence the uploader plays Wellington. City aliases included
// (Pōneke, Te Whanganui-a-Tara) per user direction.
const WELLINGTON_ANCHORS = [
  'san fran', 'meow', 'valhalla', 'caroline', 'ivy bar', 'sly bar', 'deadpool', 'third eye',
  'rogue and vagabond', 'rogue & vagabond', 'moon', 'big fan', 'laundry', 'mishmash', 'brewtown',
  'thistle', 'wunderbar', 'hunter lounge', 'grand', 'embassy', 'racket', 'malt', 'backyard',
  'green room', 'cuba st', 'courtenay', 'ghuznee', 'lambton quay', 'willis st', 'pōneke', 'poneke',
  'te whanganui-a-tara', 'whanganui-a-tara', '121 festival', 'club 121',
  'meow nū', 'meow nu', 'lulus', 'lūlūs', 'dakota', 'pow wow room', 'afters', 'cuba street tavern',
  'moon bar', 'newtown', 'mish mash', 'homegrown', 'cubadupa', 'cuba dupa',
  'rhythm and vines', 'rhythm & vines', 'northern bass', 'bay dreams', 'electric avenue',
  'hidden valley', 'splore', 'soundsplash', 'twisted frequency', 'rhythm and alps', 'rhythm & alps',
  'womad', 'aum festival', 'otherside festival', 'frequency festival',
];

const CITY_WORDS = ['wellington', 'wlg', 'pōneke', 'poneke', 'whanganui'];

function nameContainsCityWord(name: string): boolean {
  const normalized = normalizeArtistName(name);
  return CITY_WORDS.some((word) => normalized === word || normalized.includes(`${word} `) || normalized.includes(` ${word}`));
}

export async function discoverFromMixcloud(pool: Pool): Promise<ScrapeResult> {
  const queries = ['wellington', 'pōneke', 'poneke', 'te whanganui-a-tara', 'whanganui-a-tara'];
  const existing = await loadExistingNames(pool);
  let found = 0;
  let newCount = 0;
  for (const query of queries) {
    const url = `https://api.mixcloud.com/search/?q=${encodeURIComponent(query)}&type=cloudcast`;
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) continue;
    const data = (await res.json()) as { data?: Array<{ name: string; user?: MixcloudUser }> };
    for (const cloudcast of data.data ?? []) {
      const user = cloudcast.user;
      if (!user?.name) continue;
      const cloudcastName = normalizeArtistName(cloudcast.name);
      const anchored = WELLINGTON_ANCHORS.some((anchor) => cloudcastName.includes(normalizeArtistName(anchor)));
      if (!anchored) continue;
      if (nameContainsCityWord(user.name)) continue;
      const key = normalizeArtistName(user.name);
      if (existing.has(key)) continue;
      existing.add(key);
      const junk = isJunkName(user.name);
      const id = slugify(user.name);
      const result = await pool.query(
        `INSERT INTO djs (id, name, source, data_completeness, active, discovery_note) VALUES ($1, $2, 'mixcloud', 15, FALSE, $3)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, user.name, junk ? 'junk' : null],
      );
      if (result.rows.length > 0) {
        newCount += 1;
        await upsertDjLink(pool, id, 'mixcloud', user.url, `Mixcloud: ${user.name}`);
        if (junk) console.log(`  discover-mixcloud: junk candidate skipped from promotion: ${user.name}`);
      }
      found += 1;
    }
    await sleep(500);
  }
  return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: newCount, error: found === 0 ? 'No Wellington-anchored cloudcasts' : undefined };
}

export async function verifyDiscovered(pool: Pool): Promise<ScrapeResult> {
  // Event-series names (weekly nights, soundsystems, festivals) are not DJs.
  // Park them as junk so they never get promoted or listed.
  const series = (
    await pool.query(`SELECT id, name FROM djs WHERE opt_out = FALSE AND (discovery_note IS NULL OR discovery_note <> 'junk')`)
  ).rows as Array<{ id: string; name: string }>;
  let parked = 0;
  for (const dj of series) {
    if (!isEventSeriesName(dj.name)) continue;
    await pool.query(`UPDATE djs SET active = FALSE, discovery_note = 'junk', verification_level = 0, updated_at = now() WHERE id = $1`, [dj.id]);
    parked += 1;
  }
  if (parked > 0) console.log(`  verify-discovered: parked ${parked} event-series names as junk`);

  // Evidence-weighted verification: level = distinct evidence categories
  // (mixes / links / articles / gigs / multi-gigs / multi-source). level >= 2
  // flips a candidate to an active (listed) DJ; level keeps climbing as more
  // sources accumulate. multi-gigs = playing at 2+ events; multi-source = the
  // DJ shows up on 3+ distinct platforms (SoundCloud, Mixcloud, Bandcamp,
  // radio, news, event listings...) — the "shows up in three or four places,
  // that's probably a DJ" signal. Applies to every DJ — no one is listed
  // without at least 2 verifying pieces of info.
  const weighted = await pool.query(
    `UPDATE djs SET
       verification_level = evidence.level,
       verification_sources = evidence.sources,
       active = evidence.level >= 2 AND evidence.has_nz_evidence = 1,
       updated_at = now()
     FROM (
       SELECT d.id,
         (CASE WHEN EXISTS (SELECT 1 FROM dj_mixes m WHERE m.dj_id = d.id) THEN 1 ELSE 0 END) +
          (CASE WHEN EXISTS (SELECT 1 FROM dj_links l WHERE l.dj_id = d.id AND l.type <> 'festival') THEN 1 ELSE 0 END) +
         (CASE WHEN EXISTS (SELECT 1 FROM dj_articles a WHERE a.dj_id = d.id) THEN 1 ELSE 0 END) +
         (CASE WHEN EXISTS (SELECT 1 FROM event_djs ed WHERE ed.dj_id = d.id) THEN 1 ELSE 0 END) +
         (CASE WHEN (SELECT count(*) FROM event_djs ed WHERE ed.dj_id = d.id) >= 2 THEN 1 ELSE 0 END) +
         (CASE WHEN (
            SELECT count(DISTINCT s) FROM (
              SELECT m.platform AS s FROM dj_mixes m WHERE m.dj_id = d.id
              UNION ALL
              SELECT l.type FROM dj_links l WHERE l.dj_id = d.id
                AND l.type IN ('soundcloud','mixcloud','bandcamp','spotify','apple-music','tidal','deezer','qobuz','beatport','youtube','last.fm','songkick','bandsintown','setlistfm','discogs','radio','myspace','free streaming','streaming')
              UNION ALL
              SELECT COALESCE(a.source, 'article') FROM dj_articles a WHERE a.dj_id = d.id
              UNION ALL
              SELECT e.source FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = d.id
              UNION ALL
              SELECT d.source FROM djs WHERE id = d.id AND source <> 'seed'
            ) t
         ) >= 3 THEN 1 ELSE 0 END) AS level,
         COALESCE(
           ARRAY(
             SELECT source
             FROM unnest(ARRAY['mixes', 'links', 'articles', 'gigs', 'multi-gigs', 'multi-source', 'location']) AS source
             WHERE (source = 'mixes' AND EXISTS (SELECT 1 FROM dj_mixes m WHERE m.dj_id = d.id))
                OR (source = 'links' AND EXISTS (SELECT 1 FROM dj_links l WHERE l.dj_id = d.id AND l.type <> 'festival'))
                OR (source = 'articles' AND EXISTS (SELECT 1 FROM dj_articles a WHERE a.dj_id = d.id))
                OR (source = 'gigs' AND EXISTS (SELECT 1 FROM event_djs ed WHERE ed.dj_id = d.id))
                OR (source = 'multi-gigs' AND (SELECT count(*) FROM event_djs ed WHERE ed.dj_id = d.id) >= 2)
                OR (source = 'location' AND (
                  'location' = ANY(d.verification_sources)
                  OR d.profile_location ~* 'new zealand|aotearoa|[[:<:]]nz[[:>:]]|wellington|auckland|christchurch|dunedin|queenstown|hamilton|tauranga|nelson|napier|rotorua|palmerston north|new plymouth|whanganui|gisborne|timaru|invercargill|whangarei|hastings|lower hutt|upper hutt|porirua|taupo|wanaka|blenheim|waiheke'
                ))
                OR (source = 'multi-source' AND (
                  SELECT count(DISTINCT s) FROM (
                    SELECT m.platform AS s FROM dj_mixes m WHERE m.dj_id = d.id
                    UNION ALL
                    SELECT l.type FROM dj_links l WHERE l.dj_id = d.id
                      AND l.type IN ('soundcloud','mixcloud','bandcamp','spotify','apple-music','tidal','deezer','qobuz','beatport','youtube','last.fm','songkick','bandsintown','setlistfm','discogs','radio','myspace','free streaming','streaming')
                    UNION ALL
                    SELECT COALESCE(a.source, 'article') FROM dj_articles a WHERE a.dj_id = d.id
                    UNION ALL
                    SELECT e.source FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = d.id
                    UNION ALL
                    SELECT d.source FROM djs WHERE id = d.id AND source <> 'seed'
                  ) t
                ) >= 3)
           ),
           '{}'
         ) AS sources,
         (CASE WHEN
            'location' = ANY(d.verification_sources)
            OR EXISTS (SELECT 1 FROM event_djs ed WHERE ed.dj_id = d.id)
            OR d.source IN ('seed','manual','radioactive','bfm','undertheradar','sanfran','rogue-vagabond',
                            'northern-bass','snow-machine','newtown-festival','earthbeat','tora-bombora',
                            'jambase','the-others-way','eventfinda')
            OR d.bio ~* 'new zealand|aotearoa|wellington|auckland|christchurch|dunedin|queenstown|hamilton|tauranga|nelson|napier|rotorua|palmerston north|new plymouth|whanganui|gisborne|timaru|invercargill|whangarei|hastings|lower hutt|upper hutt|porirua|taupo|wanaka|blenheim|waiheke|[[:<:]]nz[[:>:]]'
            OR d.profile_location ~* 'new zealand|aotearoa|[[:<:]]nz[[:>:]]|wellington|auckland|christchurch|dunedin|queenstown|hamilton|tauranga|nelson|napier|rotorua|palmerston north|new plymouth|whanganui|gisborne|timaru|invercargill|whangarei|hastings|lower hutt|upper hutt|porirua|taupo|wanaka|blenheim|waiheke'
         THEN 1 ELSE 0 END) AS has_nz_evidence
       FROM djs d
       WHERE d.opt_out = FALSE
         AND (d.discovery_note IS NULL OR d.discovery_note <> 'junk')
     ) evidence
     WHERE djs.id = evidence.id
       AND djs.opt_out = FALSE
       AND djs.is_nz = TRUE
       AND (djs.discovery_note IS NULL OR djs.discovery_note <> 'junk')
       AND (djs.verification_level <> evidence.level
            OR djs.verification_sources <> evidence.sources
            OR djs.active <> (evidence.level >= 2 AND evidence.has_nz_evidence = 1))
     RETURNING djs.id`,
  );
  return { status: 'ok', items_found: weighted.rows.length, items_new: weighted.rows.length };
}

// News-article discovery: interviews/previews about Wellington DJs surface
// names alongside an article, which is also verification evidence.
function extractDjNamesFromTitle(title: string): string[] {
  const t = title.replace(/\s+/g, ' ').trim();
  const names: string[] = [];
  const hasDjSignal = /(^|\b)(dj|deejay|disc jockey|interview|meet)\b/i.test(t);
  if (!hasDjSignal) return names;
  const push = (raw: string): void => {
    const name = raw.replace(/^["“']+|["”']+$/g, '').trim();
    if (!name || name.length < 3 || name.length > 40) return;
    if (/\.\.|[,!?]|\.$/.test(name)) return;
    if (name.split(/\s+/).length > 3) return;
    if (/^(the|a|an|this|these|those|how|why|what|when|where|region|next|month|tomorrow|today|night|weekend|mural|flood|relief|larger|from|new|top|best|all|cases|artist|band|crew|collective|show|gig|party|festival)\b/i.test(name)) return;
    if (isJunkName(name)) return;
    names.push(name);
  };
  let match = t.match(/^Interview(?:\s*[:\-–—])?\s*(?:with\s+)?["“]?([A-Z][A-Za-z0-9 .'&+!-]{2,40})["”]?/i);
  if (match) push(match[1]);
  match = t.match(/^Meet\s+["“]?([A-Z][A-Za-z0-9 .'&+!-]{2,40})["”]?[,.]/i);
  if (match) push(match[1]);
  match = t.match(/[-–—]\s*(DJ\s+[A-Z][A-Za-z0-9 .'&+!-]{1,30})/i);
  if (match) push(match[1]);
  match = t.match(/^["“]?([A-Z][A-Za-z0-9 .'&+!-]{1,40})["”]?\s*[:\-–—]/);
  if (match && !/[-–—]\s*DJ\s/i.test(t)) {
    const name = match[1].trim();
    const after = t.slice(t.indexOf(match[0]) + match[0].length);
    if (name.split(/\s+/).length <= 3 && /dj|interview|meet/i.test(after)) push(name);
  }
  return names;
}

const NEWS_ANCHOR_QUERIES = [
  '"wellington" dj interview', '"wellington" dj news', '"wellington" dj preview', '"wellington" djs',
  '"pōneke" dj', '"te whanganui-a-tara" dj', '"wellington" techno', '"wellington" drum and bass',
  '"wellington" house music', '"wellington" nightlife dj', '"wellington" club dj', '"san fran" dj wellington',
  '"meow" wellington dj', '"cuba street" dj', '"121 festival" dj', '"valhalla" wellington dj',
  '"muzic.net.nz" dj', '"nz musician" dj', '"rnz" dj interview', '"spinoff" dj wellington',
  '"sniffers" dj', '"ambient light" dj', '"cheeky monkey" dj wellington', '"backseat mafia" dj nz',
];

// NZ music news feeds — nationwide DJ coverage (interviews, releases, gigs).
const NZ_MUSIC_FEEDS = [
  'https://www.muzic.net.nz/news/rss',
  'https://www.nzmusician.co.nz/feed',
  'https://sniffers.co.nz/feed',
];

export async function discoverFromNewsArticles(pool: Pool): Promise<ScrapeResult> {
  const existing = await loadExistingNames(pool);
  let found = 0;
  let newCount = 0;
  for (const query of NEWS_ANCHOR_QUERIES) {
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
    let xml = '';
    try {
      const res = await fetch(url, { headers: { accept: 'application/xml' }, signal: AbortSignal.timeout(15000) });
      xml = await res.text();
    } catch {
      continue;
    }
    for (const item of parseBingNewsXml(xml)) {
      for (const name of extractDjNamesFromTitle(item.title)) {
        if (isJunkName(name)) continue;
        const key = normalizeArtistName(name);
        if (existing.has(key)) continue;
        existing.add(key);
        found += 1;
        const id = slugify(name);
        const result = await pool.query(
          `INSERT INTO djs (id, name, source, data_completeness, active, discovery_note) VALUES ($1, $2, 'news-article', 15, FALSE, NULL)
           ON CONFLICT (id) DO NOTHING RETURNING id`,
          [id, name],
        );
        if (result.rows.length > 0) {
          newCount += 1;
          await pool.query(`INSERT INTO dj_aliases (dj_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, key]);
          await upsertDjArticle(pool, id, {
            title: item.title,
            url: item.link,
            source: item.source,
            publishedAt: item.pubDate ? new Date(item.pubDate) : null,
            snippet: item.description.replace(/<[^>]+>/g, '').slice(0, 300),
          });
          await upsertDjLink(pool, id, 'news', item.link, `News: ${item.source}`.trim());
          console.log(`  discover-news: candidate ${name} (${item.title.slice(0, 80)})`);
        }
      }
    }
    await sleep(500);
  }
  return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: newCount, error: found === 0 ? 'No DJ names in news' : undefined };
}

export async function discoverFromNzMusicFeeds(pool: Pool): Promise<ScrapeResult> {
  const existing = await loadExistingNames(pool);
  let found = 0;
  let newCount = 0;
  for (const feedUrl of NZ_MUSIC_FEEDS) {
    let xml = '';
    try {
      const res = await fetch(feedUrl, { headers: { accept: 'application/xml' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      xml = await res.text();
    } catch {
      continue;
    }
    for (const item of parseBingNewsXml(xml)) {
      const titleHasDjSignal = /(^|\b)(dj|deejay|disc jockey)\b/i.test(item.title);
      if (!titleHasDjSignal) continue;
      for (const name of extractDjNamesFromTitle(item.title)) {
        if (isJunkName(name)) continue;
        const key = normalizeArtistName(name);
        if (existing.has(key)) continue;
        existing.add(key);
        found += 1;
        const id = slugify(name);
        const result = await pool.query(
          `INSERT INTO djs (id, name, source, data_completeness, active, discovery_note) VALUES ($1, $2, 'news-article', 15, FALSE, NULL)
           ON CONFLICT (id) DO NOTHING RETURNING id`,
          [id, name],
        );
        if (result.rows.length > 0) {
          newCount += 1;
          await pool.query(`INSERT INTO dj_aliases (dj_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, key]);
          await upsertDjArticle(pool, id, {
            title: item.title,
            url: item.link,
            source: item.source,
            publishedAt: item.pubDate ? new Date(item.pubDate) : null,
            snippet: item.description.replace(/<[^>]+>/g, '').slice(0, 300),
          });
          await upsertDjLink(pool, id, 'news', item.link, `News: ${item.source}`.trim());
          console.log(`  discover-nz-music: candidate ${name} (${item.title.slice(0, 80)})`);
        }
      }
    }
    await sleep(500);
  }
  return { status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: newCount, error: found === 0 ? 'No DJ names in NZ music feeds' : undefined };
}

export async function discoverAll(pool: Pool): Promise<ScrapeResult[]> {
  const runners: Array<{ source: string; run: (pool: Pool) => Promise<ScrapeResult> }> = [
    { source: 'discover-soundcloud-nz', run: discoverSoundcloudNz },
    { source: 'discover-musicbrainz-edm', run: discoverMusicbrainzNzEdm },
    { source: 'discover-spotify', run: discoverSpotifyNzEdm },
    { source: 'discover-events', run: discoverFromEvents },
    { source: 'discover-mixcloud', run: discoverFromMixcloud },
    { source: 'discover-news', run: discoverFromNewsArticles },
    { source: 'discover-nz-music', run: discoverFromNzMusicFeeds },
    { source: 'verify-discovered', run: verifyDiscovered },
  ];
  const results: ScrapeResult[] = [];
  for (const runner of runners) {
    let result: ScrapeResult;
    try {
      result = await runner.run(pool);
    } catch (err) {
      result = { source: runner.source, status: 'error', items_found: 0, items_new: 0, error: err instanceof Error ? err.message : String(err) };
    }
    result.source = runner.source;
    await pool.query(
      `INSERT INTO scrapes (source, status, items_found, items_new, error, started_at, finished_at) VALUES ($1, $2, $3, $4, $5, now(), now())`,
      [runner.source, result.status, result.items_found, result.items_new, result.error ?? null],
    );
    results.push(result);
  }
  return results;
}
