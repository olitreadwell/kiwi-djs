// AI summaries for DJs (#292). Generates a short card summary and a longer
// dossier summary from the facts we hold (genres, mixes, gigs, articles,
// collabs, labels, bio). Uses DeepSeek (cheap, off-peak) via its
// OpenAI-compatible endpoint when DEEPSEEK_API_KEY is set; otherwise it
// degrades gracefully to null and the UI falls back to bio/rule-based
// text. Never invents facts — the prompt only sees what the dataset holds.
import type { Pool } from 'pg';
import { cityFromLocation } from './locations';

interface DjFacts {
  name: string;
  genres: string[];
  bio: string | null;
  city: string | null;
  profileLocation: string | null;
  mixes: { count: number; platforms: string[] };
  upcomingGigs: string[];
  pastGigs: string[];
  articles: number;
  collabs: string[];
  labels: string[];
}

export interface Summaries {
  summary: string;
  summary_long: string;
}

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

async function generateSummaries(facts: DjFacts): Promise<Summaries | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  const genreText = facts.genres.length > 0 ? `genres: ${facts.genres.join(', ')}` : 'genres: unknown yet';
  const mixText =
    facts.mixes.count > 0
      ? `${facts.mixes.count} mix${facts.mixes.count === 1 ? '' : 'es'} on ${facts.mixes.platforms.join(' and ')}`
      : 'no mixes listed yet';
  const gigsText = facts.upcomingGigs.length > 0 ? `upcoming: ${facts.upcomingGigs.join('; ')}` : 'no upcoming gigs listed';
  const pastText = facts.pastGigs.length > 0 ? `recent gigs: ${facts.pastGigs.join(', ')}` : '';
  const collabText = facts.collabs.length > 0 ? `recently played with: ${facts.collabs.join(', ')}` : '';
  const labelText = facts.labels.length > 0 ? `associated with: ${facts.labels.join(', ')}` : '';
  const articleText = facts.articles > 0 ? `mentioned in ${facts.articles} article${facts.articles === 1 ? '' : 's'}` : '';
  const location = facts.city ?? (facts.profileLocation ? cityFromLocation(facts.profileLocation) : null);
  const factsText = [
    `Name: ${facts.name}`,
    location ? `Based: ${location}` : '',
    genreText,
    facts.bio ? `Bio: ${facts.bio}` : '',
    mixText,
    gigsText,
    pastText,
    collabText,
    labelText,
    articleText,
  ]
    .filter(Boolean)
    .join('\n');

  const system =
    'You write short factual blurbs for an Aotearoa New Zealand DJ directory. ' +
    'Use ONLY the facts given. Plain human language, no cliches, no "delve", no em-dashes, ' +
    'no AI-sounding padding. Reply with JSON only: ' +
    '{"summary": "one sentence, under 24 words, for a list card", ' +
    '"summary_long": "2-3 sentences, for the profile page"}';
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: factsText },
        ],
        temperature: 0.4,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as Partial<Summaries>;
    const summary = (parsed.summary ?? '').trim();
    const summaryLong = (parsed.summary_long ?? '').trim();
    if (!summary || !summaryLong) return null;
    return { summary, summary_long: summaryLong };
  } catch {
    return null;
  }
}

async function loadFacts(pool: Pool, djId: string): Promise<DjFacts | null> {
  const dj = (
    await pool.query(
      `SELECT id, name, bio, genres, city, profile_location FROM djs WHERE id = $1`,
      [djId],
    )
  ).rows[0] as { id: string; name: string; bio: string | null; genres: string[]; city: string | null; profile_location: string | null };
  if (!dj) return null;
  const [mixes, upcoming, past, articles, collabs, labels] = await Promise.all([
    pool.query(`SELECT platform FROM dj_mixes WHERE dj_id = $1`, [djId]),
    pool.query(
      `SELECT e.name, v.name AS venue FROM event_djs ed
       JOIN events e ON e.id = ed.event_id
       LEFT JOIN venues v ON v.name = e.venue
       WHERE ed.dj_id = $1 AND e.starts_at > now() ORDER BY e.starts_at ASC LIMIT 3`,
      [djId],
    ),
    pool.query(
      `SELECT e.name FROM event_djs ed JOIN events e ON e.id = ed.event_id
       WHERE ed.dj_id = $1 AND e.starts_at <= now() ORDER BY e.starts_at DESC LIMIT 3`,
      [djId],
    ),
    pool.query(`SELECT count(*)::int AS n FROM dj_articles WHERE dj_id = $1`, [djId]),
    pool.query(
      `SELECT d2.name, count(*)::int AS c FROM event_djs ed1
       JOIN event_djs ed2 ON ed2.event_id = ed1.event_id AND ed2.dj_id <> ed1.dj_id
       JOIN djs d2 ON d2.id = ed2.dj_id
       WHERE ed1.dj_id = $1 GROUP BY d2.name ORDER BY c DESC LIMIT 4`,
      [djId],
    ),
    pool.query(`SELECT label AS name FROM dj_links WHERE dj_id = $1 AND type IN ('label', 'promoter')`, [djId]),
  ]);
  return {
    name: dj.name,
    genres: dj.genres,
    bio: dj.bio,
    city: dj.city,
    profileLocation: dj.profile_location,
    mixes: {
      count: mixes.rows.length,
      platforms: [...new Set((mixes.rows as Array<{ platform: string }>).map((m) => m.platform))],
    },
    upcomingGigs: (upcoming.rows as Array<{ name: string; venue: string | null }>).map((g) => `${g.name}${g.venue ? ` at ${g.venue}` : ''}`),
    pastGigs: (past.rows as Array<{ name: string }>).map((g) => g.name),
    articles: articles.rows[0].n as number,
    collabs: (collabs.rows as Array<{ name: string }>).map((c) => c.name),
    labels: (labels.rows as Array<{ name: string }>).map((l) => l.name),
  };
}

// Summarize DJs that don't have one yet, most information-rich first, capped
// per run so a burst of new DJs drains across a few cycles. Returns the
// number of DJs summarised.
export async function summarizeMissingDjs(pool: Pool, limit = 20): Promise<number> {
  const rows = (
    await pool.query(
      `SELECT d.id FROM djs d
       WHERE d.opt_out = FALSE AND d.active = TRUE AND d.is_nz = TRUE AND d.summary IS NULL
         AND (d.discovery_note IS NULL OR d.discovery_note <> 'junk')
       ORDER BY d.popularity DESC, d.updated_at DESC
       LIMIT $1`,
      [limit],
    )
  ).rows as Array<{ id: string }>;
  let done = 0;
  for (const row of rows) {
    const facts = await loadFacts(pool, row.id);
    if (!facts) continue;
    const summaries = await generateSummaries(facts);
    if (!summaries) break; // no key or API down — stop hammering
    await pool.query(
      `UPDATE djs SET summary = $2, summary_long = $3, updated_at = now() WHERE id = $1`,
      [row.id, summaries.summary, summaries.summary_long],
    );
    done += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return done;
}
