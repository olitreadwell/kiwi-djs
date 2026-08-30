import type { Pool } from 'pg';
import { sleep } from './http';
import { getSoundcloudClientId } from './soundcloud-client';
import type { Scraper, ScrapeResult } from './types';

// Discovery: DJs/acts playing Wellington. Signal = SoundCloud tracks named
// after Wellington venues/events, or user profiles whose city/description
// names Wellington. Candidates stay inactive until verified.
const WELLINGTON_ANCHORS = [
  'san fran', 'meow', 'valhalla', 'caroline', 'ivy bar', 'sly bar', 'deadpool', 'third eye',
  'rogue and vagabond', 'rogue & vagabond', 'moon', 'big fan', 'laundry', 'mishmash', 'brewtown',
  'thistle', 'wunderbar', 'hunter lounge', 'grand', 'embassy', 'racket', 'malt', 'backyard',
  'green room', 'cuba st', 'courtenay', 'ghuznee', 'lambton quay', 'willis st', '121 festival',
  'club 121', 'pōneke', 'poneke', 'te whanganui-a-tara', 'whanganui-a-tara', 'wellington',
  'meow nū', 'meow nu', 'lulus', 'lūlūs', 'dakota', 'pow wow room', 'afters', 'cuba street tavern',
  'moon bar', 'newtown', 'mish mash', 'homegrown', 'cubadupa', 'cuba dupa',
  'rhythm and vines', 'rhythm & vines', 'northern bass', 'bay dreams', 'electric avenue',
  'hidden valley', 'splore', 'soundsplash', 'twisted frequency', 'rhythm and alps', 'rhythm & alps',
  'womad', 'aum festival', 'otherside festival', 'frequency festival',
];

const CITY_WORDS = ['wellington', 'wlg', 'pōneke', 'poneke', 'whanganui'];

const NZ_CITIES = [
  'wellington', 'pōneke', 'poneke', 'auckland', 'tāmaki', 'christchurch', 'ōtautahi', 'hamilton',
  'kirikiriroa', 'dunedin', 'ōtepoti', 'tauranga', 'napier', 'hastings', 'new plymouth', 'nelson',
  'queenstown', 'wanaka', 'gisborne', 'whanganui', 'palmerston north', 'rotorua', 'invercargill',
  'timaru', 'blenheim', 'whangārei', 'whangarei', 'new zealand', 'nz', 'aotearoa', 'lower hutt',
  'upper hutt', 'petone', 'porirua', 'hutt',
];

function isNzProfile(user: ScUser): boolean {
  if (!user.city) return true;
  const city = user.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return NZ_CITIES.some((nz) => city.includes(nz));
}

function nameContainsCityWord(name: string): boolean {
  const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return CITY_WORDS.some((word) => normalized === word || normalized.includes(`${word} `) || normalized.includes(` ${word}`));
}

function anchored(text: string): boolean {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return WELLINGTON_ANCHORS.some((anchor) => normalized.includes(anchor));
}

interface ScUser {
  username: string;
  permalink: string;
  description?: string;
  city?: string;
  avatar_url?: string;
}

interface ScTrack {
  title?: string;
  user?: ScUser;
}

export const soundcloudScraper: Scraper = {
  source: 'soundcloud',
  async run(pool: Pool): Promise<ScrapeResult> {
    const clientId = await getSoundcloudClientId();
    if (!clientId) {
      return { status: 'error', items_found: 0, items_new: 0, error: 'SoundCloud auth failed — no valid client id (set SOUNDCLOUD_CLIENT_ID)' };
    }
    const existing = new Set((await pool.query('SELECT lower(name) AS name FROM djs')).rows.map((row) => row.name as string));
    const seen = new Set<string>();
    let newCount = 0;
    let found = 0;

    const insertCandidate = async (user: ScUser, evidence: string): Promise<void> => {
      if (seen.has(user.permalink)) return;
      seen.add(user.permalink);
      if (nameContainsCityWord(user.username)) return;
      const key = user.username.toLowerCase();
      if (existing.has(key)) return;
      existing.add(key);
      found += 1;
      const id = `soundcloud-${user.permalink}`;
      const nz = isNzProfile(user);
      const location = user.city ? `SoundCloud: ${user.city}` : null;
      // A profile that names an NZ city is the "at least one source says
      // NZ" evidence (#308) — record it so the verification rule can see it.
      const sources = user.city && nz ? ['location'] : [];
      const result = await pool.query(
        `INSERT INTO djs (id, name, bio, soundcloud_url, image_url, source, data_completeness, active, discovery_note, is_nz, profile_location, verification_sources)
         VALUES ($1, $2, $3, $4, $5, 'soundcloud', 20, FALSE, NULL, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [id, user.username, user.description ?? null, `https://soundcloud.com/${user.permalink}`, user.avatar_url ?? null, nz, location, sources],
      );
      if (result.rows.length > 0) {
        newCount += 1;
        await pool.query(`INSERT INTO dj_aliases (dj_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, key]);
        console.log(`  soundcloud: candidate ${user.username} (${evidence})`);
      }
    };

    // 1) Tracks named after Wellington venues/events → uploader plays Wellington.
    for (const query of ['wellington', 'pōneke', 'te whanganui-a-tara', 'san fran wellington', 'meow wellington']) {
      const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=20&filter.content_tier=SUB_HIGH`;
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { collection?: ScTrack[] };
      for (const track of data.collection ?? []) {
        if (!track.user?.username || !track.title) continue;
        if (!anchored(track.title)) continue;
        await insertCandidate(track.user, `track: ${track.title}`);
      }
      await sleep(700);
    }

    // 2) User profiles whose city/description names Wellington.
    for (const query of ['wellington dj', 'wellington djs', 'pōneke dj', 'wellington techno', 'wellington drum and bass', 'wellington house']) {
      const url = `https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=20`;
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { collection?: ScUser[] };
      for (const user of data.collection ?? []) {
        const text = `${user.city ?? ''} ${user.description ?? ''}`.toLowerCase();
        if (!anchored(text)) continue;
        await insertCandidate(user, 'profile');
      }
      await sleep(700);
    }

    return { source: 'soundcloud', status: found > 0 ? 'ok' : 'partial', items_found: found, items_new: newCount, error: found === 0 ? 'No Wellington-anchored SoundCloud users' : undefined };
  },
};
