import type { Pool } from 'pg';
import { isNonDjAct } from '../src/lib/scrapers/festival';
import { isJunkName, normalizeArtistName } from '../src/lib/scrapers/discover';

// Automatable dataset fixes. Each entry maps a GitHub issue to a rule-based
// pass the loop can run without an LLM: implement the fix, close the issue
// when its acceptance criteria are met, otherwise leave it open and report
// progress. Lower `priority` runs first.

export interface DatasetFixResult {
  resolved: boolean;
  detail: string;
}

export interface DatasetFix {
  issueNumber: number;
  title: string;
  priority: number;
  fix: (pool: Pool) => Promise<DatasetFixResult>;
}

interface MergePair {
  activeId: string;
  activeName: string;
  candId: string;
  candName: string;
  nameSim: number;
  confidence: number;
}

// Bigram Jaccard similarity for normalized names — cheap JS stand-in for
// pg_trgm when we already have the pair list from SQL.
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const grams = (s: string): Set<string> => {
    const out = new Set<string>();
    const padded = ` ${s} `;
    for (let i = 0; i < padded.length - 1; i += 1) out.add(padded.slice(i, i + 2));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter += 1;
  return inter / (ga.size + gb.size - inter);
}

async function evidenceCounts(pool: Pool, djId: string): Promise<{ mixes: number; links: number; articles: number; gigs: number }> {
  const [mixes, links, articles, gigs] = await Promise.all([
    pool.query('SELECT count(*)::int AS n FROM dj_mixes WHERE dj_id = $1', [djId]),
    pool.query('SELECT count(*)::int AS n FROM dj_links WHERE dj_id = $1', [djId]),
    pool.query('SELECT count(*)::int AS n FROM dj_articles WHERE dj_id = $1', [djId]),
    pool.query('SELECT count(*)::int AS n FROM event_djs WHERE dj_id = $1', [djId]),
  ]);
  return {
    mixes: mixes.rows[0].n as number,
    links: links.rows[0].n as number,
    articles: articles.rows[0].n as number,
    gigs: gigs.rows[0].n as number,
  };
}

// Merge a candidate's evidence into an active DJ, then delete the candidate.
// Evidence tables use ON CONFLICT DO NOTHING so an active DJ's own rows win.
async function mergeCandidateIntoActive(pool: Pool, activeId: string, candId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO dj_mixes (id, dj_id, platform, title, url, kind, created_at)
       SELECT regexp_replace(id, '^[^-]+-', $1 || '-'), $1, platform, title, url, kind, created_at
       FROM dj_mixes WHERE dj_id = $2
       ON CONFLICT (id) DO NOTHING`,
      [activeId, candId],
    );
    await client.query(`DELETE FROM dj_mixes WHERE dj_id = $1`, [candId]);
    await client.query(
      `INSERT INTO dj_links (id, dj_id, type, url, label, created_at)
       SELECT regexp_replace(id, '^[^-]+-', $1 || '-'), $1, type, url, label, created_at
       FROM dj_links WHERE dj_id = $2
       ON CONFLICT (id) DO NOTHING`,
      [activeId, candId],
    );
    await client.query(`DELETE FROM dj_links WHERE dj_id = $1`, [candId]);
    await client.query(
      `INSERT INTO dj_articles (id, dj_id, title, url, source, published_at, snippet, created_at)
       SELECT regexp_replace(id, '^[^-]+-', $1 || '-'), $1, title, url, source, published_at, snippet, created_at
       FROM dj_articles WHERE dj_id = $2
       ON CONFLICT (id) DO NOTHING`,
      [activeId, candId],
    );
    await client.query(`DELETE FROM dj_articles WHERE dj_id = $1`, [candId]);
    await client.query(
      `INSERT INTO event_djs (event_id, dj_id)
       SELECT event_id, $1 FROM event_djs WHERE dj_id = $2
       ON CONFLICT (event_id, dj_id) DO NOTHING`,
      [activeId, candId],
    );
    await client.query(`DELETE FROM event_djs WHERE dj_id = $1`, [candId]);
    await client.query(`UPDATE events SET dj_id = $1 WHERE dj_id = $2`, [activeId, candId]);
    await client.query(
      `INSERT INTO dj_aliases (dj_id, alias)
       SELECT $1, alias FROM dj_aliases WHERE dj_id = $2 ON CONFLICT DO NOTHING`,
      [activeId, candId],
    );
    await client.query(`DELETE FROM dj_aliases WHERE dj_id = $1`, [candId]);
    // Carry over missing profile fields from the candidate.
    await client.query(
      `UPDATE djs SET
         bio = COALESCE(bio, (SELECT bio FROM djs WHERE id = $2)),
         image_url = COALESCE(image_url, (SELECT image_url FROM djs WHERE id = $2)),
         genres = ARRAY(SELECT DISTINCT unnest(genres || (SELECT genres FROM djs WHERE id = $2))),
         soundcloud_url = COALESCE(soundcloud_url, (SELECT soundcloud_url FROM djs WHERE id = $2)),
         instagram_url = COALESCE(instagram_url, (SELECT instagram_url FROM djs WHERE id = $2)),
         facebook_url = COALESCE(facebook_url, (SELECT facebook_url FROM djs WHERE id = $2)),
         mixcloud_url = COALESCE(mixcloud_url, (SELECT mixcloud_url FROM djs WHERE id = $2)),
         website_url = COALESCE(website_url, (SELECT website_url FROM djs WHERE id = $2))
       WHERE id = $1`,
      [activeId, candId],
    );
    await client.query(`DELETE FROM djs WHERE id = $1`, [candId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Shared duplicate pass (#159 + #193): find candidate/active pairs, score
// match confidence (name similarity + alias overlap + shared evidence), and
// auto-merge only pairs above the 0.9 threshold.
async function runDuplicateMergePass(pool: Pool): Promise<{ merged: number; remaining: MergePair[] }> {
  const pairs = (
    await pool.query(
      `SELECT a.id AS active_id, a.name AS active_name, c.id AS cand_id, c.name AS cand_name,
              similarity(a.name, c.name) AS name_sim
       FROM djs a JOIN djs c ON a.active = TRUE AND c.active = FALSE
       WHERE a.opt_out = FALSE AND c.opt_out = FALSE
         AND (c.discovery_note IS NULL OR c.discovery_note <> 'junk')
         AND similarity(a.name, c.name) > 0.5
       ORDER BY name_sim DESC`,
    )
  ).rows as Array<{ active_id: string; active_name: string; cand_id: string; cand_name: string; name_sim: number }>;

  const aliases = (await pool.query('SELECT dj_id, alias FROM dj_aliases')).rows as Array<{ dj_id: string; alias: string }>;
  const aliasByDj = new Map<string, Set<string>>();
  for (const row of aliases) {
    const set = aliasByDj.get(row.dj_id) ?? new Set<string>();
    set.add(normalizeArtistName(row.alias));
    aliasByDj.set(row.dj_id, set);
  }

  const scored: MergePair[] = [];
  for (const pair of pairs) {
    const candNorm = normalizeArtistName(pair.cand_name);
    const activeNorm = normalizeArtistName(pair.active_name);
    const nameSim = Math.max(pair.name_sim, bigramSimilarity(candNorm, activeNorm));
    let confidence = nameSim;
    if (aliasByDj.get(pair.active_id)?.has(candNorm)) confidence += 0.1;
    const candEvidence = await evidenceCounts(pool, pair.cand_id);
    if (candEvidence.gigs > 0 || candEvidence.links > 0) confidence += 0.1;
    scored.push({
      activeId: pair.active_id,
      activeName: pair.active_name,
      candId: pair.cand_id,
      candName: pair.cand_name,
      nameSim,
      confidence: Math.min(1, confidence),
    });
  }

  let merged = 0;
  const remaining: MergePair[] = [];
  for (const pair of scored.sort((a, b) => b.confidence - a.confidence)) {
    if (pair.confidence > 0.9) {
      await mergeCandidateIntoActive(pool, pair.activeId, pair.candId);
      merged += 1;
    } else {
      remaining.push(pair);
    }
  }
  return { merged, remaining };
}

const GENERIC_BIO_PATTERNS: RegExp[] = [
  /^dj (and producer|from|based in|at|for|of)/i,
  /^wellington (dj|based)/i,
  /^a dj (and|from|based)/i,
  /^dj and producer/i,
  /^electronic (dj|music)/i,
  /^plays (electronic|house|techno|dance)/i,
  /^djs? (playing|spinning|mixing)/i,
];

async function runBioQualityPass(pool: Pool): Promise<{ low: number; ok: number }> {
  const rows = (
    await pool.query(
      `SELECT id, name, bio FROM djs
       WHERE opt_out = FALSE AND is_nz = TRUE AND active = TRUE
         AND (discovery_note IS NULL OR discovery_note <> 'junk')
         AND bio IS NOT NULL`,
    )
  ).rows as Array<{ id: string; name: string; bio: string }>;
  const normalizedBios = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeArtistName(row.bio);
    normalizedBios.set(key, (normalizedBios.get(key) ?? 0) + 1);
  }
  let low = 0;
  let ok = 0;
  for (const row of rows) {
    const key = normalizeArtistName(row.bio);
    const trimmed = row.bio.trim();
    const isLow =
      trimmed.length < 20 ||
      (trimmed.length < 40 && GENERIC_BIO_PATTERNS.some((re) => re.test(trimmed))) ||
      (normalizedBios.get(key) ?? 0) > 1;
    await pool.query(`UPDATE djs SET bio_quality = $1 WHERE id = $2`, [isLow ? 'low' : 'ok', row.id]);
    if (isLow) low += 1;
    else ok += 1;
  }
  return { low, ok };
}

const COMPLETENESS_SQL = `(
  (CASE WHEN bio IS NOT NULL THEN 15 ELSE 0 END) +
  (CASE WHEN cardinality(genres) > 0 THEN 5 ELSE 0 END) +
  (CASE WHEN image_url IS NOT NULL THEN 10 ELSE 0 END) +
  (CASE WHEN soundcloud_url IS NOT NULL OR instagram_url IS NOT NULL OR facebook_url IS NOT NULL
         OR website_url IS NOT NULL OR mixcloud_url IS NOT NULL THEN 10 ELSE 0 END) +
  (SELECT LEAST(30, count(*)::int * 10) FROM dj_mixes m WHERE m.dj_id = d.id) +
  (SELECT LEAST(20, count(*)::int * 5) FROM event_djs ed WHERE ed.dj_id = d.id) +
  (SELECT LEAST(10, count(*)::int * 5) FROM dj_articles a WHERE a.dj_id = d.id)
)`;

export const DATASET_FIXES: DatasetFix[] = [
  {
    issueNumber: 159,
    title: 'duplicate DJ detection + merge',
    priority: 1,
    fix: async (pool) => {
      const { merged, remaining } = await runDuplicateMergePass(pool);
      const detail = `Merged ${merged} candidate(s) into active DJs; ${remaining.length} low-confidence pair(s) left.`;
      return { resolved: merged > 0 || remaining.length === 0, detail };
    },
  },
  {
    issueNumber: 193,
    title: 'multi-source name match confidence scoring',
    priority: 2,
    fix: async (pool) => {
      const { merged, remaining } = await runDuplicateMergePass(pool);
      const detail = `Confidence-scored ${remaining.length + merged} candidate/active pair(s); auto-merged ${merged} above 0.9.`;
      return { resolved: remaining.length === 0, detail };
    },
  },
  {
    issueNumber: 138,
    title: 'stale DJ flagging (no activity >12 months)',
    priority: 3,
    fix: async (pool) => {
      const flagged = await pool.query(
        `UPDATE djs SET stale_since = now()
         WHERE opt_out = FALSE AND is_nz = TRUE
           AND (discovery_note IS NULL OR discovery_note <> 'junk')
           AND stale_since IS NULL
           AND (
             EXISTS (SELECT 1 FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = djs.id AND e.starts_at IS NOT NULL)
             OR EXISTS (SELECT 1 FROM dj_articles a WHERE a.dj_id = djs.id AND a.published_at IS NOT NULL)
             OR EXISTS (SELECT 1 FROM dj_mixes m WHERE m.dj_id = djs.id)
           )
           AND GREATEST(
             COALESCE((SELECT max(e.starts_at) FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = djs.id), '-infinity'::timestamptz),
             COALESCE((SELECT max(a.published_at) FROM dj_articles a WHERE a.dj_id = djs.id), '-infinity'::timestamptz),
             COALESCE((SELECT max(m.created_at) FROM dj_mixes m WHERE m.dj_id = djs.id), '-infinity'::timestamptz)
           ) < now() - interval '12 months'`,
      );
      const cleared = await pool.query(
        `UPDATE djs SET stale_since = NULL
         WHERE stale_since IS NOT NULL
           AND GREATEST(
             COALESCE((SELECT max(e.starts_at) FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = djs.id), '-infinity'::timestamptz),
             COALESCE((SELECT max(a.published_at) FROM dj_articles a WHERE a.dj_id = djs.id), '-infinity'::timestamptz),
             COALESCE((SELECT max(m.created_at) FROM dj_mixes m WHERE m.dj_id = djs.id), '-infinity'::timestamptz)
           ) >= now() - interval '12 months'`,
      );
      const detail = `Flagged ${flagged.rowCount} stale DJ(s), cleared ${cleared.rowCount} active again.`;
      return { resolved: true, detail };
    },
  },
  {
    issueNumber: 195,
    title: 'junk candidate auto-cleanup improvements',
    priority: 4,
    fix: async (pool) => {
      const venues = (await pool.query('SELECT name FROM venues')).rows as Array<{ name: string }>;
      const venueNames = new Set(venues.map((v) => normalizeArtistName(v.name)));
      const candidates = (
        await pool.query(
          `SELECT id, name FROM djs
           WHERE active = FALSE AND opt_out = FALSE
             AND (discovery_note IS NULL OR discovery_note <> 'junk')`,
        )
      ).rows as Array<{ id: string; name: string }>;
      let marked = 0;
      for (const cand of candidates) {
        const norm = normalizeArtistName(cand.name);
        const evidence = await evidenceCounts(pool, cand.id);
        const hasEvidence = evidence.mixes + evidence.links + evidence.articles + evidence.gigs > 0;
        const isVenueName = venueNames.has(norm) && !hasEvidence;
        if (isJunkName(cand.name) || isNonDjAct(cand.name) || isVenueName) {
          await pool.query(`UPDATE djs SET discovery_note = 'junk' WHERE id = $1`, [cand.id]);
          marked += 1;
        }
      }
      const deleted = await pool.query(
        `DELETE FROM djs WHERE discovery_note = 'junk' AND active = FALSE
         AND NOT EXISTS (SELECT 1 FROM dj_mixes m WHERE m.dj_id = djs.id)
         AND NOT EXISTS (SELECT 1 FROM dj_links l WHERE l.dj_id = djs.id)
         AND NOT EXISTS (SELECT 1 FROM dj_articles a WHERE a.dj_id = djs.id)
         AND NOT EXISTS (SELECT 1 FROM event_djs ed WHERE ed.dj_id = djs.id)`,
      );
      const detail = `Marked ${marked} candidate(s) junk (venue/non-DJ/junk-name signals); deleted ${deleted.rowCount} evidence-free junk candidate(s).`;
      return { resolved: true, detail };
    },
  },
  {
    issueNumber: 142,
    title: 'bio quality audit (duplicate/generic bios)',
    priority: 5,
    fix: async (pool) => {
      const { low, ok } = await runBioQualityPass(pool);
      const detail = `Audited ${low + ok} active DJ bios: ${low} low quality, ${ok} ok.`;
      return { resolved: true, detail };
    },
  },
  {
    issueNumber: 140,
    title: 'data_completeness scoring recalibration',
    priority: 6,
    fix: async (pool) => {
      const updated = await pool.query(
        `UPDATE djs d SET data_completeness = ${COMPLETENESS_SQL}`,
      );
      const detail = `Recalibrated data_completeness for ${updated.rowCount} DJ(s) (mixes 30 / gigs 20 / bio 15 / photo 10 / links 10 / articles 10 / genres 5).`;
      return { resolved: true, detail };
    },
  },
];
