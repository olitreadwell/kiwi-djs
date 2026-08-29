import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getPool } from './lib/db.mjs';
import { runAllScrapers } from '../src/lib/scrapers/run-all';

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

async function auditAndFileIssues(pool: ReturnType<typeof getPool>): Promise<void> {
  // Audit phase: surface data gaps as GitHub issues (cheap, rule-based — no LLM).
  const open = openIssueTitles();
  let filed = 0;

  const thin = (
    await pool.query(
      `SELECT d.id, d.name, d.verification_level, d.verification_sources
       FROM djs d
       WHERE d.opt_out = FALSE AND d.is_nz = TRUE AND d.active = TRUE
         AND NOT EXISTS (SELECT 1 FROM dj_mixes m WHERE m.dj_id = d.id)`,
    )
  ).rows as Array<{ id: string; name: string; verification_level: number; verification_sources: string[] }>;
  if (filed < 1 && thin.length >= 2) {
    const names = thin.slice(0, 5).map((d) => `- ${d.name}`).join('\n');
    const title = `data: ${thin.length} verified DJs have no mixes`;
    if (!open.has(title)) {
      runGh(['issue', 'create', '--title', title, '--body', `${names}\n\nFind SoundCloud/Mixcloud mixes or mark as not applicable.`]);
      log(`Filed issue: ${title}`);
      filed += 1;
    }
  }

  const failing = (
    await pool.query(
      `SELECT source, count(*) AS failures
       FROM scrapes
       WHERE status = 'error' AND started_at > now() - interval '48 hours'
       GROUP BY source ORDER BY failures DESC LIMIT 2`,
    )
  ).rows as Array<{ source: string; failures: string }>;
  if (filed < 1 && failing.length > 0) {
    for (const row of failing) {
      const title = `fix: scraper "${row.source}" failing`;
      if (open.has(title)) continue;
      runGh(['issue', 'create', '--title', title, '--body', `${row.source}: ${row.failures} errors in 48h. See scrapes table.`]);
      log(`Filed issue: ${title}`);
      break;
    }
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
  const handoff = [
    '# Loop handoff — compact state',
    `Updated: ${new Date().toISOString()}`,
    `Last cycle: ${totals.totalNew} new / ${totals.totalFound} found`,
    `Dataset: ${counts.active_djs} active DJs, ${counts.candidates} candidates, ${counts.mixes} mixes, ${counts.articles} articles, ${counts.links} links, ${counts.events} events`,
    failing.length > 0 ? `Failing sources: ${failing.map((f) => f.source).join(', ')}` : 'Failing sources: none',
    'Next: run `pnpm loop --once`; open GitHub issues are the work queue.',
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
  await pool.query('VACUUM ANALYZE');
  log(`Compacted: ${junk.rows.length} junk candidates, ${scrapes.rows.length} stale scrape rows removed.`);
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
  const totalNew = results.reduce((sum, r) => sum + r.items_new, 0);
  const totalFound = results.reduce((sum, r) => sum + r.items_found, 0);
  const elapsed = Math.round((Date.now() - startedAt.getTime()) / 1000);
  for (const result of results) {
    log(`${result.status.padEnd(7)} found=${result.items_found} new=${result.items_new}${result.error ? ` — ${result.error}` : ''}`);
  }
  log(`Cycle done in ${elapsed}s: ${totalNew} new items, ${totalFound} found.`);
  await reportFailingSources(pool);
  await auditAndFileIssues(pool);
  await writeHandoff(pool, { totalNew, totalFound });
  if (totalNew > 0) {
    const before = existsSync(new URL('../src/data/snapshot.json', import.meta.url))
      ? readFileSync(new URL('../src/data/snapshot.json', import.meta.url), 'utf8')
      : '';
    regenerateSnapshot();
    const after = readFileSync(new URL('../src/data/snapshot.json', import.meta.url), 'utf8');
    commitAndPush(before !== after);
  }
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
      lastTotals = await runCycle(pool);
      if (once) break;
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
