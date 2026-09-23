import type { Pool } from 'pg';
import { slugify } from '../slug';
import { upsertEvent } from './upsert';
import { upsertDjLink } from './enrich';
import { isJunkName, normalizeArtistName } from './discover';
import type { ScrapeResult } from './types';

export interface FestivalArtist {
  name: string;
  description?: string;
  /** Stage the act plays, when the source publishes a timetable (#328). */
  stage?: string;
  /** Set start, when the source publishes a timetable (#328). */
  startsAt?: Date | null;
  /** Set end, when the source publishes a timetable (#328). */
  endsAt?: Date | null;
  /** Billing text exactly as printed, for b2b and support sets (#328). */
  actLabel?: string;
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
  /**
   * Split billed acts into individual DJs on `b2b`, `&`, `w/` and `w`
   * ("Manakin b2b J.A.P.R" -> Manakin, J.A.P.R). Every split DJ keeps the
   * billed slot, so a poster timetable renders unchanged while each name
   * earns its own candidate row (#328).
   */
  splitB2b?: boolean;
}

/**
 * Split a billed act into individual DJ names. Returns the input unchanged
 * when it holds a single act.
 */
export function splitBilledAct(act: string): string[] {
  return act
    .split(/\s+(?:b2b|&|w\/|with|w)\s+/i)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Write one timetable slot (stage + set times) onto an event/DJ link. Slots
 * are additive: a source without set times leaves the columns alone. (#328)
 */
export async function upsertEventSlot(
  pool: Pool,
  slot: { eventId: string; djId: string; stage?: string; startsAt?: Date | null; endsAt?: Date | null; actLabel?: string; source: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO event_djs (event_id, dj_id, stage, starts_at, ends_at, act_label, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_id, dj_id) DO UPDATE
       SET stage = COALESCE(EXCLUDED.stage, event_djs.stage),
           starts_at = COALESCE(EXCLUDED.starts_at, event_djs.starts_at),
           ends_at = COALESCE(EXCLUDED.ends_at, event_djs.ends_at),
           act_label = COALESCE(EXCLUDED.act_label, event_djs.act_label),
           source = EXCLUDED.source`,
    [slot.eventId, slot.djId, slot.stage ?? null, slot.startsAt ?? null, slot.endsAt ?? null, slot.actLabel ?? null, slot.source],
  );
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

// True when a name/description carries an unambiguous non-DJ signal (band,
// choir, dance troupe, circus, singer, acoustic/rock act). Neutral names
// ("Zinc", "Sam") return false — absence of a DJ signal is not a junk signal.
export function isNonDjAct(name: string, description?: string): boolean {
  const nameText = name.toLowerCase();
  const descText = (description ?? '').toLowerCase();
  return NON_DJ_SIGNALS.some((re) => re.test(nameText) || re.test(descText));
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
        return {
          name: entry.name.replace(/\s+/g, ' ').trim(),
          description: entry.description?.replace(/\s+/g, ' ').trim(),
          stage: entry.stage?.replace(/\s+/g, ' ').trim(),
          startsAt: entry.startsAt ?? null,
          endsAt: entry.endsAt ?? null,
          actLabel: entry.actLabel?.replace(/\s+/g, ' ').trim(),
        };
      })
      .filter((artist) => artist.name)
      .map((artist) => [artist.name.toLowerCase(), artist]),
  ).values()];
  let found = 0;
  let newCount = 0;
  for (const artist of artists) {
    const billed = artist.name;
    if (exclude.has(billed.toLowerCase())) continue;
    // A b2b or support billing is one poster slot with several DJs. Each DJ
    // gets a candidate row and shares the stage, times and billing text.
    const names = lineup.splitB2b ? splitBilledAct(billed) : [billed];
    const actLabel = artist.actLabel ?? (names.length > 1 ? billed : undefined);
    await upsertEvent(pool, {
      id: lineup.eventIdPrefix,
      name: lineup.eventName,
      venue: lineup.venue,
      startsAt: lineup.startsAt ?? null,
      url: lineup.url,
      source,
    });
    for (const name of names) {
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
      // lineup links via event_djs, which is also the timetable slot (#328).
      await upsertEventSlot(pool, {
        eventId: lineup.eventIdPrefix,
        djId: id,
        stage: artist.stage,
        startsAt: artist.startsAt,
        endsAt: artist.endsAt,
        actLabel,
        source: lineup.djSource ?? 'festival',
      });
    }
  }
  return {
    status: artists.length > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: newCount,
    error: artists.length === 0 ? 'No artists parsed' : undefined,
  };
}
