import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getPool } from './lib/db.mjs';
import { runAllScrapers } from '../src/lib/scrapers/run-all';
import { DATASET_FIXES, dedupeEvents } from './dataset-fixes';
import { buildIssueQueue, loadIssueQueue, writeIssueQueue, type QueueIssue } from './issue-queue';
import { normaliseGenres } from '../src/lib/genres';
import { isRelevantArticle } from '../src/lib/scrapers/enrich';
import { summarizeMissingDjs } from '../src/lib/summarize';
import { archiveMissingLinks } from '../src/lib/scrapers/wayback';
import { classifyProfileLocation, hasNzLocationEvidence } from '../src/lib/locations';

// Self-improving scrape loop.
//
// Each cycle: run all scrapers + discovery + enrichment + verification,
// then act on the results:
//   - new data found  -> regenerate snapshot, commit, push (Vercel deploys)
//   - failing sources -> log the worst offender so the next pass can fix it
//   - thin data       -> back off (5/10/15/30/60 min) so we never hammer
//                        sources that have nothing new
//
// The 60-minute cap guarantees at least one run per day even when nothing
// new surfaces. The loop is cheap (no LLM calls) and is scheduled off-peak:
// the launchd agent fires at 4:30am NZT = 16:30 UTC, the start of DeepSeek's
// off-peak discount window, so future LLM-driven enrichment stays cheap.
//
// Usage:
//   pnpm loop            run forever, backing off as data thins
//   pnpm loop --once     run a single cycle then exit (manual/testing)
//   pnpm loop --no-push  snapshot + commit but do not push

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOG_DIR = new URL('../logs/', import.meta.url);
const LOG_FILE = new URL('loop.log', LOG_DIR);
const PID_FILE = new URL('loop.pid', LOG_DIR);
const STATE_FILE = new URL('source-state.json', LOG_DIR);

// Adaptive source management: a source that errors 3 cycles in a row gets
// disabled so the loop stops hammering it; it re-enables after 24h to retry.
const DISABLE_AFTER_FAILURES = 3;
const REENABLE_AFTER_HOURS = 24;

interface SourceState {
  consecutiveFailures: number;
  lastSeen: string;
}
const HANDOFF_FILE = new URL('../.loop/handoff.md', import.meta.url);
const PHASE_FILE = new URL('../.loop/phase.json', import.meta.url);

// Issues phase: the loop works through open automatable dataset issues
// (dedupe, stale flagging, junk cleanup, bio audit, completeness) before
// resuming scrape/enrich cycles. One fix per cycle, then back to scraping
// once the queue is drained or MAX_ISSUE_CYCLES pass.
const MAX_ISSUE_CYCLES = 6;
const ISSUE_BACKOFF_MINUTES = 5;

interface PhaseState {
  phase: 'issues' | 'scrape';
  cyclesInPhase: number;
  issuesResolved: number;
}

function loadPhase(): PhaseState {
  if (!existsSync(PHASE_FILE)) return { phase: 'issues', cyclesInPhase: 0, issuesResolved: 0 };
  try {
    const parsed = JSON.parse(readFileSync(PHASE_FILE, 'utf8')) as Partial<PhaseState>;
    return {
      phase: parsed.phase === 'scrape' ? 'scrape' : 'issues',
      cyclesInPhase: parsed.cyclesInPhase ?? 0,
      issuesResolved: parsed.issuesResolved ?? 0,
    };
  } catch {
    return { phase: 'issues', cyclesInPhase: 0, issuesResolved: 0 };
  }
}

function savePhase(state: PhaseState): void {
  const dir = new URL('../.loop/', import.meta.url);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(PHASE_FILE, JSON.stringify(state, null, 2));
}

function log(line: string): void {
  const entry = `[${new Date().toISOString()}] ${line}`;
  console.log(entry);
  appendFileSync(LOG_FILE, `${entry}\n`);
}

function nextBackoffMinutes(totalNew: number, totalFound: number): number {
  if (totalNew >= 4) return 5;
  if (totalNew >= 2) return 10;
  if (totalNew >= 1) return 15;
  if (totalFound > 0) return 30;
  return 60;
}

function acquireLock(): boolean {
  if (existsSync(PID_FILE)) {
    const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        log(`Another loop instance already running (pid ${pid}). Exiting.`);
        return false;
      } catch {
        // Stale pidfile — previous instance died without cleanup.
      }
    }
  }
  writeFileSync(PID_FILE, String(process.pid));
  return true;
}

function releaseLock(): void {
  try {
    rmSync(PID_FILE);
  } catch {
    // Already gone.
  }
}

function loadSourceState(): Record<string, SourceState> {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Record<string, SourceState>;
  } catch {
    return {};
  }
}

function saveSourceState(state: Record<string, SourceState>): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function disabledSources(state: Record<string, SourceState>): Set<string> {
  const now = Date.now();
  const disabled = new Set<string>();
  for (const [source, entry] of Object.entries(state)) {
    const stale = now - new Date(entry.lastSeen).getTime() > REENABLE_AFTER_HOURS * 3_600_000;
    if (entry.consecutiveFailures >= DISABLE_AFTER_FAILURES && !stale) {
      disabled.add(source);
    }
  }
  return disabled;
}

function updateSourceState(
  state: Record<string, SourceState>,
  results: Array<{ source?: string; status: string }>,
): void {
  const now = new Date().toISOString();
  for (const result of results) {
    if (!result.source) continue;
    const previous = state[result.source]?.consecutiveFailures ?? 0;
    state[result.source] = {
      consecutiveFailures: result.status === 'error' ? previous + 1 : 0,
      lastSeen: now,
    };
  }
}

function run(cmd: string, args: string[]): { ok: boolean; out: string } {
  const result = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return { ok: result.status === 0, out: (result.stdout || result.stderr || '').trim() };
}

function installLaunchdAgent(): void {
  const home = process.env.HOME ?? '/Users/olitreadwell';
  const plistPath = `${home}/Library/LaunchAgents/com.olitreadwell.nz-djs-loop.plist`;
  const repoPath = REPO_ROOT.replace(/\/$/, '');
  // Run node directly, not `pnpm loop` — pnpm's startup under launchd
  // (no TTY) intermittently hangs before spawning the child.
  const nodeBin = run('which', ['node']).out || '/usr/local/bin/node';
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.olitreadwell.nz-djs-loop</string>
  <key>WorkingDirectory</key>
  <string>${repoPath}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>--env-file=.env.local</string>
    <string>--import</string>
    <string>tsx</string>
    <string>scripts/loop.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${home}/.local/share/mise/installs/node/lts/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>4</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${home}/Library/Logs/aotearoa-djs-loop.log</string>
  <key>StandardErrorPath</key>
  <string>${home}/Library/Logs/aotearoa-djs-loop.log</string>
</dict>
</plist>
`;
  writeFileSync(plistPath, plist, 'utf8');
  log(`Wrote ${plistPath}`);
  const boot = run('launchctl', ['bootstrap', `gui/${process.getuid?.() ?? process.env.UID ?? ''}`, plistPath]);
  log(boot.ok ? `launchctl bootstrap ok: ${boot.out}` : `launchctl bootstrap failed: ${boot.out} — run: launchctl bootstrap gui/$(id -u) ${plistPath}`);
}

function regenerateSnapshot(): void {
  const { ok, out } = run(process.execPath, ['--env-file=.env.local', '--import', 'tsx', 'scripts/export-snapshot.mjs']);
  log(ok ? `Snapshot regenerated: ${out}` : `Snapshot regeneration failed: ${out}`);
}

function commitAndPush(snapshotChanged: boolean): void {
  if (!snapshotChanged) return;
  const add = run('git', ['add', 'src/data/snapshot.json']);
  if (!add.ok) {
    log(`git add failed: ${add.out}`);
    return;
  }
  const ledgerFile = new URL('../data/link-votes.json', import.meta.url);
  if (existsSync(ledgerFile)) {
    run('git', ['add', 'data/link-votes.json']);
  }
  const commit = run('git', ['commit', '-m', 'chore: self-improving loop snapshot update']);
  if (!commit.ok) {
    log(`git commit skipped: ${commit.out}`);
    return;
  }
  log(`Committed: ${commit.out.split('\n')[0]}`);
  if (!process.argv.includes('--no-push')) {
    const push = run('git', ['push', 'origin', 'HEAD']);
    log(push.ok ? `Pushed: ${push.out}` : `Push failed: ${push.out}`);
  }
}

// Pull the GitHub vote ledger (written by the snapshot-mode API) and merge
// it into link_feedback so the snapshot's best-link counts self-correct.
async function mergeLedgerIntoVotes(pool: ReturnType<typeof getPool>): Promise<number> {
  const ledgerFile = new URL('../data/link-votes.json', import.meta.url);
  run('git', ['fetch', 'origin', '--quiet']);
  const fetched = run('git', ['show', 'origin/main:data/link-votes.json']);
  if (fetched.ok && fetched.out) {
    const dir = new URL('../data/', import.meta.url);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(ledgerFile, fetched.out);
  }
  if (!existsSync(ledgerFile)) return 0;
  let ledger: { votes?: Record<string, { ips?: Record<string, boolean> }> };
  try {
    ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'));
  } catch {
    return 0;
  }
  let merged = 0;
  for (const [linkId, entry] of Object.entries(ledger.votes ?? {})) {
    for (const [ipHash, helpful] of Object.entries(entry.ips ?? {})) {
      const result = await pool.query(
        `INSERT INTO link_feedback (link_id, helpful, ip_hash) VALUES ($1, $2, $3)
         ON CONFLICT (link_id, ip_hash) DO NOTHING`,
        [linkId, helpful, `ledger-${ipHash}`],
      );
      merged += result.rowCount ?? 0;
    }
  }
  if (merged > 0) log(`Merged ${merged} GitHub ledger votes into link_feedback.`);
  return merged;
}

async function reportFailingSources(pool: ReturnType<typeof getPool>): Promise<void> {
  const rows = (
    await pool.query(
      `SELECT source, count(*) AS failures
       FROM scrapes
       WHERE status = 'error' AND started_at > now() - interval '24 hours'
       GROUP BY source
       ORDER BY failures DESC
       LIMIT 3`,
    )
  ).rows as Array<{ source: string; failures: string }>;
  if (rows.length === 0) {
    log('No failing sources in last 24h.');
    return;
  }
  for (const row of rows) {
    log(`Failing source: ${row.source} (${row.failures} errors in 24h) — next pass should fix it.`);
  }
}

function runGh(args: string[]): string {
  const result = run('gh', args);
  return result.out;
}

function openIssueTitles(): Set<string> {
  const out = runGh(['issue', 'list', '--state', 'open', '--limit', '50', '--json', 'title']);
  try {
    return new Set((JSON.parse(out) as Array<{ title: string }>).map((issue) => issue.title));
  } catch {
    return new Set();
  }
}

function openIssueNumbers(): Set<number> {
  const out = runGh(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number']);
  try {
    return new Set((JSON.parse(out) as Array<{ number: number }>).map((issue) => issue.number));
  } catch {
    return new Set();
  }
}

function logQueueTop(queue: QueueIssue[], count = 3): void {
  if (queue.length === 0) {
    log('Issue queue: empty.');
    return;
  }
  const lines = queue.slice(0, count).map((issue, i) => `  ${i + 1}. #${issue.number} ${issue.title}${issue.workable ? ' (automatable)' : ''}`);
  log(`Issue queue (${queue.length} open):\n${lines.join('\n')}`);
}

// Issues phase cycle: audit every open issue into the prioritised,
// dependency-ordered queue (.loop/queue.json), then work the top open
// automatable dataset issue. Feature/research issues are logged for the
// next agent session. Switches back to the scrape phase when nothing is
// workable or MAX_ISSUE_CYCLES pass.
async function runIssuesCycle(pool: ReturnType<typeof getPool>): Promise<{ switchedToScrape: boolean }> {
  const phase = loadPhase();
  const queue = buildIssueQueue();
  writeIssueQueue(queue);
  logQueueTop(queue);
  if (queue.length === 0) {
    log('Issues phase: no open issues — resuming data improvement runs.');
    savePhase({ phase: 'scrape', cyclesInPhase: 0, issuesResolved: phase.issuesResolved });
    return { switchedToScrape: true };
  }
  const top = queue[0];
  if (!top.workable) {
    log(`Issues phase: top issue #${top.number} — "${top.title}" (${top.labels.join(', ') || 'unlabelled'}) needs an agent session. Queue written to .loop/queue.json.`);
  }
  const workable = queue.find((issue) => issue.workable);
  if (!workable) {
    log('Issues phase: no open automatable dataset issues — resuming data improvement runs.');
    savePhase({ phase: 'scrape', cyclesInPhase: 0, issuesResolved: phase.issuesResolved });
    return { switchedToScrape: true };
  }
  const fix = DATASET_FIXES.find((candidate) => candidate.issueNumber === workable.number)!;
  log(`Issues phase (cycle ${phase.cyclesInPhase + 1}): working on #${fix.issueNumber} — ${fix.title}.`);
  try {
    const result = await fix.fix(pool);
    if (result.resolved) {
      runGh(['issue', 'close', String(fix.issueNumber)]);
      log(`Issues phase: #${fix.issueNumber} resolved — closed. ${result.detail}`);
      phase.issuesResolved += 1;
    } else {
      log(`Issues phase: #${fix.issueNumber} not yet resolved. ${result.detail}`);
    }
  } catch (err) {
    log(`Issues phase: #${fix.issueNumber} fix errored: ${err instanceof Error ? err.message : String(err)}`);
  }
  phase.cyclesInPhase += 1;
  if (phase.cyclesInPhase >= MAX_ISSUE_CYCLES) {
    log(`Issues phase: ${MAX_ISSUE_CYCLES} cycles done — resuming data improvement runs.`);
    savePhase({ phase: 'scrape', cyclesInPhase: 0, issuesResolved: phase.issuesResolved });
    return { switchedToScrape: true };
  }
  savePhase(phase);
  return { switchedToScrape: false };
}

async function auditAndFileIssues(pool: ReturnType<typeof getPool>): Promise<void> {
  // Audit phase: surface data gaps as GitHub issues (cheap, rule-based — no
  // LLM). Files up to 4 new issues per cycle, one per category, skipping
  // titles already open so the queue stays fresh.
  const open = openIssueTitles();
  const MAX_PER_CYCLE = 4;
  let filed = 0;

  const file = (title: string, body: string): void => {
    if (filed >= MAX_PER_CYCLE || open.has(title)) return;
    runGh(['issue', 'create', '--title', title, '--body', body]);
    log(`Filed issue: ${title}`);
    filed += 1;
  };

  const noMixes = (await pool.query(
    `SELECT name FROM djs d WHERE opt_out = FALSE AND is_nz = TRUE AND active = TRUE
     AND (discovery_note IS NULL OR discovery_note <> 'junk')
     AND NOT EXISTS (SELECT 1 FROM dj_mixes m WHERE m.dj_id = d.id)`,
  )).rows as Array<{ name: string; genres: string[] }>;
  if (noMixes.length >= 2) {
    file(
      `data: ${noMixes.length} verified DJs have no mixes`,
      `${noMixes.slice(0, 5).map((d) => `- ${d.name}`).join('\n')}\n\nFind SoundCloud/Mixcloud mixes or mark as not applicable.`,
    );
  }

  const failing = (await pool.query(
    `SELECT source, count(*) AS failures FROM scrapes
     WHERE status = 'error' AND started_at > now() - interval '48 hours'
     GROUP BY source ORDER BY failures DESC LIMIT 2`,
  )).rows as Array<{ source: string; failures: string }>;
  for (const row of failing) {
    file(`fix: scraper "${row.source}" failing`, `${row.source}: ${row.failures} errors in 48h. See scrapes table.`);
  }

  const noBio = (await pool.query(
    `SELECT name FROM djs WHERE opt_out = FALSE AND is_nz = TRUE AND active = TRUE
     AND (discovery_note IS NULL OR discovery_note <> 'junk') AND bio IS NULL`,
  )).rows as Array<{ name: string }>;
  if (noBio.length >= 2) {
    file(
      `data: ${noBio.length} verified DJs have no bio`,
      `${noBio.slice(0, 5).map((d) => `- ${d.name}`).join('\n')}\n\nWrite a short bio from public sources.`,
    );
  }

  const noPhoto = (await pool.query(
    `SELECT name FROM djs WHERE opt_out = FALSE AND is_nz = TRUE AND active = TRUE
     AND (discovery_note IS NULL OR discovery_note <> 'junk') AND image_url IS NULL`,
  )).rows as Array<{ name: string }>;
  if (noPhoto.length >= 2) {
    file(
      `data: ${noPhoto.length} verified DJs have no photo`,
      `${noPhoto.slice(0, 5).map((d) => `- ${d.name}`).join('\n')}\n\nPull avatar from SoundCloud/Mixcloud/iTunes or mark as not applicable.`,
    );
  }

  const genericGenres = (await pool.query(
    `SELECT name, genres FROM djs WHERE opt_out = FALSE AND is_nz = TRUE AND active = TRUE
     AND (discovery_note IS NULL OR discovery_note <> 'junk')
     AND cardinality(genres) > 0
     AND genres <@ ARRAY['Dance','Electronic','Alternative','Pop','Rock','Country','Eclectic','World','Experimental','Indie','Metal','Punk','Folk','Classical','Lounge','Chillout']`,
  )).rows as Array<{ name: string; genres: string[] }>;
  if (genericGenres.length >= 2) {
    file(
      `data: ${genericGenres.length} DJs have only generic genres`,
      `${genericGenres.slice(0, 5).map((d) => `- ${d.name} (${d.genres.join(', ')})`).join('\n')}\n\nPull specific subgenres from track tags.`,
    );
  }

  const noRegion = (await pool.query(
    `SELECT name FROM venues WHERE address IS NOT NULL AND (region IS NULL OR region = '')`,
  )).rows as Array<{ name: string }>;
  if (noRegion.length >= 2) {
    file(
      `data: ${noRegion.length} venues have no region`,
      `${noRegion.slice(0, 5).map((v) => `- ${v.name}`).join('\n')}\n\nGeocode via Nominatim or set manually.`,
    );
  }

  const locationRows = (await pool.query(
    `SELECT id, name, profile_location, verification_sources FROM djs
     WHERE opt_out = FALSE AND active = TRUE AND is_nz = TRUE
       AND profile_location IS NOT NULL AND profile_location <> ''`,
  )).rows as Array<{ id: string; name: string; profile_location: string; verification_sources: string[] }>;
  const nonNzLocation: Array<{ name: string; profile_location: string }> = [];
  for (const row of locationRows) {
    if (classifyProfileLocation(row.profile_location) !== 'non-nz') continue;
    if (hasNzLocationEvidence(row.verification_sources)) continue;
    nonNzLocation.push({ name: row.name, profile_location: row.profile_location });
  }
  if (nonNzLocation.length >= 2) {
    file(
      `data: ${nonNzLocation.length} DJs' profiles list a non-NZ location`,
      `${nonNzLocation.slice(0, 5).map((d) => `- ${d.name} (${d.profile_location})`).join('\n')}\n\nArtists should list New Zealand as their location on at least one profile.`,
    );
  }

  // #308/#321: a listed DJ must have at least one NZ source (profile
  // location, curated/radio source, or NZ bio). Gigs don't count — playing
  // an NZ event doesn't make someone an NZ DJ. verifyDiscovered enforces
  // this on promotion; this audit catches anything added outside the pipeline.
  const noNzEvidence = (await pool.query(
    `SELECT name FROM djs d
     WHERE d.opt_out = FALSE AND d.active = TRUE AND d.is_nz = TRUE
       AND (d.discovery_note IS NULL OR d.discovery_note <> 'junk')
       AND NOT ('location' = ANY(d.verification_sources))
       AND d.source NOT IN ('seed','manual','radioactive','bfm')
       AND COALESCE(d.bio, '') !~* 'new zealand|aotearoa|wellington|auckland|christchurch|dunedin|queenstown|hamilton|tauranga|nelson|napier|rotorua|palmerston north|new plymouth|whanganui|gisborne|timaru|invercargill|whangarei|hastings|lower hutt|upper hutt|porirua|taupo|wanaka|blenheim|waiheke|[[:<:]]nz[[:>:]]'
       AND COALESCE(d.profile_location, '') !~* 'new zealand|aotearoa|[[:<:]]nz[[:>:]]|wellington|auckland|christchurch|dunedin|queenstown|hamilton|tauranga|nelson|napier|rotorua|palmerston north|new plymouth|whanganui|gisborne|timaru|invercargill|whangarei|hastings|lower hutt|upper hutt|porirua|taupo|wanaka|blenheim|waiheke'`,
  )).rows as Array<{ name: string }>;
  if (noNzEvidence.length >= 2) {
    file(
      `data: ${noNzEvidence.length} listed DJs have no NZ source`,
      `${noNzEvidence.slice(0, 5).map((d) => `- ${d.name}`).join('\n')}\n\nEvery listed DJ needs a profile location naming NZ, a curated/radio source, or an NZ bio mention — gigs don't count.`,
    );
  }

  const stuck = (await pool.query(
    `SELECT name FROM djs WHERE opt_out = FALSE AND is_nz = TRUE AND active = FALSE
     AND (discovery_note IS NULL OR discovery_note <> 'junk')
     AND created_at < now() - interval '7 days'`,
  )).rows as Array<{ name: string }>;
  if (stuck.length >= 3) {
    file(
      `data: ${stuck.length} candidates stuck unverified for 7+ days`,
      `${stuck.slice(0, 5).map((d) => `- ${d.name}`).join('\n')}\n\nReview: verify, junk, or drop.`,
    );
  }

}

async function writeHandoff(pool: ReturnType<typeof getPool>, totals: { totalNew: number; totalFound: number }): Promise<void> {
  // Compaction phase: compact state so the next loop starts from memory,
  // not a fresh cold start.
  const counts = (
    await pool.query(
      `SELECT
         count(*) FILTER (WHERE active)::int AS active_djs,
         count(*) FILTER (WHERE NOT active)::int AS candidates,
         (SELECT count(*)::int FROM dj_mixes) AS mixes,
         (SELECT count(*)::int FROM dj_articles) AS articles,
         (SELECT count(*)::int FROM dj_links) AS links,
         (SELECT count(*)::int FROM events) AS events
       FROM djs`,
    )
  ).rows[0] as Record<string, number>;
  const failing = (
    await pool.query(
      `SELECT source FROM scrapes WHERE status = 'error' AND started_at > now() - interval '24 hours'
       GROUP BY source ORDER BY count(*) DESC LIMIT 3`,
    )
  ).rows as Array<{ source: string }>;
  const phase = loadPhase();
  const queue = loadIssueQueue();
  const top = queue[0];
  const handoff = [
    '# Loop handoff — compact state',
    `Updated: ${new Date().toISOString()}`,
    `Phase: ${phase.phase} (cycle ${phase.cyclesInPhase}, ${phase.issuesResolved} issues resolved)`,
    `Last cycle: ${totals.totalNew} new / ${totals.totalFound} found`,
    `Dataset: ${counts.active_djs} active DJs, ${counts.candidates} candidates, ${counts.mixes} mixes, ${counts.articles} articles, ${counts.links} links, ${counts.events} events`,
    failing.length > 0 ? `Failing sources: ${failing.map((f) => f.source).join(', ')}` : 'Failing sources: none',
    top ? `Next issue: #${top.number} — ${top.title}${top.workable ? ' (automatable)' : ' (needs agent)'}` : 'Next issue: none open',
    'Queue: .loop/queue.json (priority + dependency ordered). Run `pnpm loop --once` to work the top automatable issue.',
    '',
  ].join('\n');
  const handoffDir = new URL('../.loop/', import.meta.url);
  if (!existsSync(handoffDir)) mkdirSync(handoffDir, { recursive: true });
  writeFileSync(HANDOFF_FILE, handoff);
}

// Dataset compaction, run before every cycle: drop junk candidates that
// never got verified, prune stale scrape history, refresh planner stats.
async function compactDataset(pool: ReturnType<typeof getPool>): Promise<void> {
  const junk = await pool.query(
    `DELETE FROM djs
     WHERE discovery_note = 'junk' AND active = FALSE AND created_at < now() - interval '30 days'
     RETURNING id`,
  );
  const scrapes = await pool.query(`DELETE FROM scrapes WHERE started_at < now() - interval '30 days' RETURNING id`);
  // Re-normalise stored genres every cycle: scrapers fold new tags through
  // normaliseGenres, but this catches legacy/edge-case tags that slipped
  // through (case variants, hashtags, compound soup).
  const genreRows = (await pool.query(`SELECT id, genres FROM djs WHERE cardinality(genres) > 0`)).rows as Array<{
    id: string;
    genres: string[];
  }>;
  let genreFixes = 0;
  for (const row of genreRows) {
    const normalised = normaliseGenres(row.genres);
    if (normalised.length !== row.genres.length || normalised.some((g, i) => g !== row.genres[i])) {
      await pool.query(`UPDATE djs SET genres = $2 WHERE id = $1`, [row.id, normalised]);
      genreFixes += 1;
    }
  }
  const { merged, deleted } = await dedupeEvents(pool);
  // Re-validate stored news articles against the relevance filter: Bing
  // returns wrong-person news for common names ("Mark Knight" the
  // cartoonist), so drop articles that no longer pass.
  const articleRows = (
    await pool.query(
      `SELECT a.id, d.name, a.title, a.snippet FROM dj_articles a JOIN djs d ON d.id = a.dj_id`,
    )
  ).rows as Array<{ id: string; name: string; title: string; snippet: string | null }>;
  let articleFixes = 0;
  for (const row of articleRows) {
    if (isRelevantArticle(row.name, { title: row.title, link: '', source: '', pubDate: '', description: row.snippet ?? '' })) continue;
    await pool.query(`DELETE FROM dj_articles WHERE id = $1`, [row.id]);
    articleFixes += 1;
  }
  await pool.query('VACUUM ANALYZE');
  log(`Compacted: ${junk.rows.length} junk candidates, ${scrapes.rows.length} stale scrape rows, ${genreFixes} genre normalisations, ${merged} duplicate events merged (${deleted} deleted), ${articleFixes} irrelevant articles removed.`);
}

async function runCycle(pool: ReturnType<typeof getPool>): Promise<{ totalNew: number; totalFound: number }> {
  const startedAt = new Date();
  await compactDataset(pool);
  const state = loadSourceState();
  const disabled = disabledSources(state);
  if (disabled.size > 0) {
    log(`Skipping disabled sources (${DISABLE_AFTER_FAILURES}+ consecutive errors): ${[...disabled].join(', ')}.`);
  }
  const results = await runAllScrapers(pool, { disabledSources: disabled });
  updateSourceState(state, results);
  saveSourceState(state);
  await mergeLedgerIntoVotes(pool);
  const summarizeLimit = Number(process.env.SUMMARIZE_LIMIT ?? 20);
  const summarised = await summarizeMissingDjs(pool, summarizeLimit);
  if (summarised > 0) log(`Summarised ${summarised} DJs (AI).`);
  const archiveLimit = Number(process.env.ARCHIVE_LIMIT ?? 10);
  const archived = await archiveMissingLinks(pool, archiveLimit);
  if (archived > 0) log(`Archived ${archived} links to the Wayback Machine.`);
  const totalNew = results.reduce((sum, r) => sum + r.items_new, 0);
  const totalFound = results.reduce((sum, r) => sum + r.items_found, 0);
  const elapsed = Math.round((Date.now() - startedAt.getTime()) / 1000);
  for (const result of results) {
    log(`${result.status.padEnd(7)} found=${result.items_found} new=${result.items_new}${result.error ? ` — ${result.error}` : ''}`);
  }
  log(`Cycle done in ${elapsed}s: ${totalNew} new items, ${totalFound} found.`);
  await reportFailingSources(pool);
  await auditAndFileIssues(pool);
  const queue = buildIssueQueue();
  writeIssueQueue(queue);
  logQueueTop(queue);
  await writeHandoff(pool, { totalNew, totalFound });
  // Regenerate every cycle and commit only when the snapshot actually
  // changed — enrichment (genres, completeness, verification) mutates the
  // dataset even when no new scraped items were found.
  const before = existsSync(new URL('../src/data/snapshot.json', import.meta.url))
    ? readFileSync(new URL('../src/data/snapshot.json', import.meta.url), 'utf8')
    : '';
  regenerateSnapshot();
  const after = readFileSync(new URL('../src/data/snapshot.json', import.meta.url), 'utf8');
  commitAndPush(before !== after);
  return { totalNew, totalFound };
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  if (process.argv.includes('--install')) {
    installLaunchdAgent();
    process.exit(0);
  }
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  if (!acquireLock()) process.exit(0);

  const pool = getPool();
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Shutting down.');
    void pool.end().finally(() => {
      releaseLock();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log(`Loop started (pid ${process.pid}, ${once ? 'once' : 'continuous'}).`);
  try {
    let lastTotals = { totalNew: 0, totalFound: 0 };
    do {
      if (loadPhase().phase === 'issues') {
        const { switchedToScrape } = await runIssuesCycle(pool);
        if (once) break;
        if (switchedToScrape) continue;
        log(`Next issues cycle in ${ISSUE_BACKOFF_MINUTES} min.`);
        await new Promise((resolve) => setTimeout(resolve, ISSUE_BACKOFF_MINUTES * 60_000));
        continue;
      }
      lastTotals = await runCycle(pool);
      if (once) break;
      // After a scrape cycle, if automatable dataset issues are open, work
      // on them before the next data improvement run.
      const open = openIssueNumbers();
      if (DATASET_FIXES.some((fix) => open.has(fix.issueNumber))) {
        log('Automatable dataset issues open — switching to issues phase.');
        savePhase({ phase: 'issues', cyclesInPhase: 0, issuesResolved: loadPhase().issuesResolved });
        continue;
      }
      const backoff = nextBackoffMinutes(lastTotals.totalNew, lastTotals.totalFound);
      log(`Next cycle in ${backoff} min.`);
      await new Promise((resolve) => setTimeout(resolve, backoff * 60_000));
    } while (!shuttingDown);
  } finally {
    if (!shuttingDown) {
      await pool.end();
      releaseLock();
    }
  }
}

main().catch((err) => {
  console.error(err);
  releaseLock();
  process.exit(1);
});
