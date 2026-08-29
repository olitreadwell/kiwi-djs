import type { Pool } from 'pg';
import { slugify } from '../slug';
import { upsertEvent } from './upsert';
import { upsertDjLink } from './enrich';
import { isJunkName, normalizeArtistName } from './discover';
import type { ScrapeResult } from './types';

export interface FestivalArtist {
  name: string;
  description?: string;
}

export interface FestivalLineup {
  eventIdPrefix: string;
  eventName: string;
  venue?: string;
  startsAt?: Date | null;
  url: string;
  artists: Array<string | FestivalArtist>;
  includeAll?: boolean;
  exclude?: string[];
  include?: string[];
  djSource?: string;
}

// Strict DJ signals — unambiguous DJ markers and electronic genres. Used for
// free-text names/descriptions (Newtown blurbs, Others Way names) where words
// like "beats", "bass", "dub" or "halftime" are unreliable (a band blurb can
// say "drum beats" or "halftime oranges").
const STRICT_DJ_SIGNALS: RegExp[] = [
  /\bdj\b/i, /\bdeejay\b/i, /\bdisc jockey\b/i,
  /\bb2b\b/i, /\bsoundsystem\b/i, /\bsound system\b/i,
  /\btechno\b/i, /\btrance\b/i, /\bpsytrance\b/i,
  /\bhouse\b/i, /\bdrum ?(?:and|&) ?bass\b/i, /\bdnb\b/i, /\bjungle\b/i,
  /\bgarage\b/i, /\bukg\b/i, /\bgrime\b/i, /\bdubstep\b/i,
  /\bbreaks\b/i, /\belectro\b/i, /\bhardstyle\b/i, /\bminimal\b/i,
  /\bIDM\b/i, /\bEDM\b/i, /\bdisco\b/i, /\bdisko\b/i, /\brave\b/i,
  /\bvinyl\b/i, /\bturntabl\w*\b/i, /\bdecks\b/i, /\bcrates?\b/i,
  /\bmix(?:es|ing|master|set|tape)\b/i, /\bbeat ?maker\b/i,
  /\bdancefloor\b/i, /\bdance ?floors?\b/i, /\bsets\b/i,
  /\bwobble\b/i, /\bselector\b/i, /\bresident\b/i, /\bspinning\b/i,
  /\bsteppers\b/i, /\bmid[- ]?tempo\b/i, /\belectroswing\b/i,
  /\bsynth\b/i, /\bbounce\b/i, /\b4am\b/i, /\bdance music\b/i,
  /\bclub music\b/i, /\belectronic music\b/i, /\belectronic dance\b/i,
  /\bindie dance\b/i, /\bdancehall\b/i, /\bnightlife\b/i,
  /\bambient\b/i, /\bdowntempo\b/i,
];

// Non-DJ signals — bands, choirs, dance troupes, circus, singers,
// acoustic/rock/folk acts. Only consulted when no DJ signal matched.
const NON_DJ_SIGNALS: RegExp[] = [
  /\b(?:band|bands|ensemble|ensembles|choir|chorus|quartet|quintet|trio|orchestra|philharmonic|players|revue|showband|group|collective|crew|society|academy|studio|school|university|college|youth|kids|children|junior|senior|polyclub)\b/i,
  /\b(?:dance|dancers|dancing|dancy|hula|belly ?dance|samba|batucada|capoeira|kapa haka|taiko|taikoza|ballet|flamenco|bollywood|troupe)\b/i,
  /\b(?:circus|acrobat|juggler|clown|mime|puppet|magician|comedy|comedian|poet|poetry|storyteller|theatre|theater|drama|musical|opera|burlesque)\b/i,
  /\b(?:singers?|songwriter|singer-songwriter|singing|songwriting|rapper|emcee|mc)\b/i,
  /\b(?:taekwon|karate|martial|sports?|fitness|yoga|meditation|wellness)\b/i,
  /\b(?:acoustic|folk|rock|country|blues|jazz|ska|punk|metal|pop|gospel|classical|swing|bluegrass|celtic|polka|mariachi|afrobeat|reggae|roots|world|fusion|kirtan|medicine|grunge|alternative|indie|rnb|soul|soulful|hip[- ]hop|rap|drum|drums|drumming)\b/i,
  /\b(?:live looping|chanting|club)\b/i,
];

export function isDjAct(name: string, description?: string): boolean {
  const nameText = name.toLowerCase();
  const descText = (description ?? '').toLowerCase();
  if (STRICT_DJ_SIGNALS.some((re) => re.test(nameText) || re.test(descText))) return true;
  if (NON_DJ_SIGNALS.some((re) => re.test(nameText) || re.test(descText))) return false;
  return false;
}

// Lenient DJ signals for structured genre tags (Earth Beat contributor pages
// tag every act, e.g. "Deep house and techno", "Acoustic Funk").
const GENRE_DJ_SIGNALS: RegExp[] = [
  /\bdj\b/i, /\bdeejay\b/i, /\bsoundsystem\b/i, /\bsound system\b/i,
  /\btechno\b/i, /\btrance\b/i, /\bpsytrance\b/i, /\bhouse\b/i,
  /\bdrum ?(?:and|&) ?bass\b/i, /\bdnb\b/i, /\bjungle\b/i, /\bgarage\b/i,
  /\bukg\b/i, /\bgrime\b/i, /\bdubstep\b/i, /\bbreaks\b/i, /\belectro\b/i,
  /\belectronic\b/i, /\belectronica\b/i, /\bambient\b/i, /\bdowntempo\b/i,
  /\bhardstyle\b/i, /\bminimal\b/i, /\bIDM\b/i, /\bEDM\b/i, /\bdub\b/i,
  /\bdisco\b/i, /\bclub\b/i, /\brave\b/i, /\bvinyl\b/i, /\bturntabl\w*\b/i,
  /\bdecks\b/i, /\bselector\b/i, /\bresident\b/i, /\bspinning\b/i, /\bsets\b/i,
  /\bmix(?:es|ing|master|set|tape)\b/i, /\bproducer\b/i, /\bbeats\b/i,
  /\bbass\b/i, /\bdancefloor\b/i, /\bdance music\b/i, /\bclub music\b/i,
  /\belectronic music\b/i, /\bindie dance\b/i, /\bdancehall\b/i,
  /\bnightlife\b/i, /\b4am\b/i, /\bwobble\b/i, /\bbaselines?\b/i,
  /\bcrates?\b/i, /\bwax\b/i, /\bmid[- ]?tempo\b/i, /\belectroswing\b/i,
  /\bsynth\b/i, /\bbounce\b/i, /\bsteppers\b/i, /\bhalftime\b/i,
  /\bdubwise\b/i, /\bworld beats\b/i, /\bearth bass\b/i, /\buk bass\b/i,
];

const GENRE_NON_DJ_SIGNALS: RegExp[] = [
  /\b(?:band|ensemble|choir|chorus|quartet|trio|orchestra|group|crew|collective|society|academy|studio|school|youth|kids|children)\b/i,
  /\b(?:acoustic|folk|rock|country|blues|jazz|ska|punk|metal|pop|gospel|classical|swing|bluegrass|celtic|polka|mariachi|afrobeat|reggae|roots|world|fusion|kirtan|medicine|grunge|alternative|indie|rnb|soul|hip[- ]hop|rap|singing|songwriting|chanting|live looping|dance|dancers|circus|comedy|poetry|theatre|opera|burlesque|singer|vocalist|songwriter|rapper|emcee|mc)\b/i,
];

export function isDjGenreTag(name: string, tag: string): boolean {
  const nameText = name.toLowerCase();
  const tagText = tag.toLowerCase();
  if (STRICT_DJ_SIGNALS.some((re) => re.test(nameText))) return true;
  if (GENRE_DJ_SIGNALS.some((re) => re.test(tagText))) return true;
  if (GENRE_NON_DJ_SIGNALS.some((re) => re.test(tagText))) return false;
  return false;
}

// Shared ingest for festival lineup pages. Only DJ acts are added: each
// becomes a candidate DJ (source 'festival') plus one event row per artist,
// so a DJ appearing at 2+ festivals/events earns the 'multi-gigs'
// verification evidence in verifyDiscovered. Non-DJ acts are skipped
// entirely — no candidate, no event.
export async function ingestFestivalLineup(pool: Pool, source: string, lineup: FestivalLineup): Promise<ScrapeResult> {
  const exclude = new Set((lineup.exclude ?? []).map((name) => name.toLowerCase()));
  const include = new Set((lineup.include ?? []).map((name) => name.toLowerCase()));
  const artists = [...new Map(
    lineup.artists
      .map((artist) => {
        const entry = typeof artist === 'string' ? { name: artist } : artist;
        return { name: entry.name.replace(/\s+/g, ' ').trim(), description: entry.description?.replace(/\s+/g, ' ').trim() };
      })
      .filter((artist) => artist.name)
      .map((artist) => [artist.name.toLowerCase(), artist]),
  ).values()];
  let found = 0;
  let newCount = 0;
  for (const artist of artists) {
    const name = artist.name;
    if (exclude.has(name.toLowerCase())) continue;
    const isDj = lineup.includeAll
      ? true
      : include.has(name.toLowerCase()) || isDjAct(name, artist.description);
    if (!isDj) continue;
    // Junk filter catches placeholder names from free-text event titles
    // ("DJ", "special guest"), but a name with an explicit DJ signal like
    // "DJ ATU-D2" or "KB the DJ" is a real act — keep it.
    if (isJunkName(name) && !isDjAct(name)) continue;
    const key = normalizeArtistName(name);
    if (!key || key.length < 3) continue;
    found += 1;
    const id = slugify(name);
    const result = await pool.query(
      `INSERT INTO djs (id, name, source, data_completeness, active, discovery_note)
       VALUES ($1, $2, $3, 15, FALSE, NULL)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, name, lineup.djSource ?? 'festival'],
    );
    if (result.rows.length > 0) {
      newCount += 1;
      await pool.query(`INSERT INTO dj_aliases (dj_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, key]);
      await upsertDjLink(pool, id, 'festival', lineup.url, `${lineup.eventName} lineup`);
      console.log(`  ${source}: candidate ${name}`);
    }
    // One event row per festival, not one per DJ (#16). Every DJ on the
    // lineup links via event_djs.
    await upsertEvent(pool, {
      id: lineup.eventIdPrefix,
      name: lineup.eventName,
      venue: lineup.venue,
      startsAt: lineup.startsAt ?? null,
      url: lineup.url,
      source,
    });
    await pool.query(`INSERT INTO event_djs (event_id, dj_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [lineup.eventIdPrefix, id]);
  }
  return {
    status: artists.length > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: newCount,
    error: artists.length === 0 ? 'No artists parsed' : undefined,
  };
}
