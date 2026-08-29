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

function run(cmd: string, args: string[]): { ok: boolean; out: string } {
  const result = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return { ok: result.status === 0, out: (result.stdout || result.stderr || '').trim() };
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
  const results = await runAllScrapers(pool);
  const totalNew = results.reduce((sum, r) => sum + r.items_new, 0);
  const totalFound = results.reduce((sum, r) => sum + r.items_found, 0);
  const elapsed = Math.round((Date.now() - startedAt.getTime()) / 1000);
  for (const result of results) {
    log(`${result.status.padEnd(7)} found=${result.items_found} new=${result.items_new}${result.error ? ` — ${result.error}` : ''}`);
  }
  log(`Cycle done in ${elapsed}s: ${totalNew} new items, ${totalFound} found.`);
  await reportFailingSources(pool);
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
