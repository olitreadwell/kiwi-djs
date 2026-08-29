import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { getPool } from './lib/db.mjs';
import { runAllScrapers } from '../src/lib/scrapers/run-all';
import type { ScrapeResult } from '../src/lib/scrapers/types';

const BACKOFF_MINUTES = [5, 10, 15, 30, 60];
const THICK_THRESHOLD = Number(process.env.IMPROVE_THICK_THRESHOLD ?? 10);
const THIN_RUNS_BEFORE_DAILY = 3;
const OFF_PEAK_HOUR = Number(process.env.IMPROVE_OFF_PEAK_HOUR ?? 6);
const AGENT_EVERY_PASS = process.env.IMPROVE_AGENT_EVERY_PASS === 'true';
const CHANGELOG_KEEP_ENTRIES = 12;
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROMPT_FILE = join(REPO_ROOT, 'scripts', 'improve-prompt.md');

interface LoopState {
  id: string;
  mode: 'active' | 'daily';
  backoff_index: number;
  consecutive_thin_runs: number;
  last_run_at: Date | null;
  next_run_at: Date | null;
  last_thickness: number;
  last_summary: unknown;
}

interface ImprovementSignals {
  worst_sources: unknown[];
  dead_end_searches: unknown[];
  enrichment_targets: unknown[];
}

function logLine(level: 'info' | 'warn' | 'error', event: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...extra }));
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function nextOffPeakDate(now: Date, hour: number): Date {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

async function ensureLoopStateTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loop_state (
      id                    TEXT PRIMARY KEY,
      mode                  TEXT NOT NULL DEFAULT 'active',
      backoff_index         INTEGER NOT NULL DEFAULT 0,
      consecutive_thin_runs INTEGER NOT NULL DEFAULT 0,
      last_run_at           TIMESTAMPTZ,
      next_run_at           TIMESTAMPTZ,
      last_thickness        INTEGER NOT NULL DEFAULT 0,
      last_summary          JSONB,
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function loadLoopState(pool: Pool): Promise<LoopState> {
  await ensureLoopStateTable(pool);
  await pool.query(
    `INSERT INTO loop_state (id, next_run_at) VALUES ('main', now()) ON CONFLICT (id) DO NOTHING`,
  );
  const { rows } = await pool.query(`SELECT * FROM loop_state WHERE id = 'main'`);
  return rows[0] as LoopState;
}

function computeNextRun(
  state: LoopState,
  thickness: number,
  now: Date,
): Pick<LoopState, 'mode' | 'backoff_index' | 'consecutive_thin_runs' | 'next_run_at'> {
  if (thickness >= THICK_THRESHOLD) {
    return {
      mode: 'active',
      backoff_index: 0,
      consecutive_thin_runs: 0,
      next_run_at: addMinutes(now, BACKOFF_MINUTES[0]),
    };
  }
  const consecutiveThinRuns = state.consecutive_thin_runs + 1;
  if (state.mode === 'daily') {
    return {
      mode: 'daily',
      backoff_index: state.backoff_index,
      consecutive_thin_runs: consecutiveThinRuns,
      next_run_at: nextOffPeakDate(now, OFF_PEAK_HOUR),
    };
  }
  const backoffIndex = Math.min(state.backoff_index + 1, BACKOFF_MINUTES.length - 1);
  if (backoffIndex === BACKOFF_MINUTES.length - 1 && consecutiveThinRuns >= THIN_RUNS_BEFORE_DAILY) {
    return {
      mode: 'daily',
      backoff_index: backoffIndex,
      consecutive_thin_runs: consecutiveThinRuns,
      next_run_at: nextOffPeakDate(now, OFF_PEAK_HOUR),
    };
  }
  return {
    mode: 'active',
    backoff_index: backoffIndex,
    consecutive_thin_runs: consecutiveThinRuns,
    next_run_at: addMinutes(now, BACKOFF_MINUTES[backoffIndex]),
  };
}

async function measureThickness(pool: Pool, results: ScrapeResult[], startedAt: Date): Promise<number> {
  const itemsNew = results.reduce((sum, result) => sum + result.items_new, 0);
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM djs WHERE created_at >= $1`, [startedAt]);
  return itemsNew + rows[0].n;
}

async function saveLoopState(pool: Pool, state: LoopState): Promise<void> {
  await pool.query(
    `UPDATE loop_state
     SET mode = $1, backoff_index = $2, consecutive_thin_runs = $3,
         last_run_at = now(), next_run_at = $4, last_thickness = $5,
         last_summary = $6, updated_at = now()
     WHERE id = 'main'`,
    [
      state.mode,
      state.backoff_index,
      state.consecutive_thin_runs,
      state.next_run_at,
      state.last_thickness,
      JSON.stringify(state.last_summary),
    ],
  );
}

async function collectImprovementSignals(pool: Pool): Promise<ImprovementSignals> {
  const worst = await pool.query(
    `SELECT source, status, count(*)::int AS runs
     FROM scrapes GROUP BY 1, 2 ORDER BY runs DESC LIMIT 5`,
  );
  const deadEnds = await pool.query(
    `SELECT query, count(*)::int AS searches
     FROM search_events WHERE results = 0 GROUP BY 1 ORDER BY searches DESC LIMIT 10`,
  );
  const targets = await pool.query(
    `SELECT id, name, popularity, data_completeness
     FROM djs WHERE active = TRUE AND opt_out = FALSE
     ORDER BY popularity DESC, data_completeness ASC LIMIT 10`,
  );
  return { worst_sources: worst.rows, dead_end_searches: deadEnds.rows, enrichment_targets: targets.rows };
}

function buildImprovePrompt(signals: ImprovementSignals): string {
  const template = readFileSync(PROMPT_FILE, 'utf8');
  return template.replace('<signals>', JSON.stringify(signals, null, 2));
}

function runAgentHandoff(prompt: string): Promise<void> {
  const override = process.env.IMPROVE_AGENT_CMD;
  const child = override
    ? spawn(override, { shell: true, cwd: REPO_ROOT, stdio: 'inherit' })
    : spawn('codex', ['exec', '-p', 'deepseek', '--approve-for-me', '--', prompt], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`agent handoff exited with code ${code}`))));
  });
}

function compactChangelog(): void {
  const changelogPath = join(REPO_ROOT, 'CHANGELOG.md');
  const archivePath = join(REPO_ROOT, 'CHANGELOG.archive.md');
  const content = readFileSync(changelogPath, 'utf8');
  const parts = content.split(/(?=^## )/m);
  const header = parts[0];
  const entries = parts.slice(1).filter((part) => part.trim().length > 0);
  if (entries.length <= CHANGELOG_KEEP_ENTRIES) return;
  const kept = entries.slice(0, CHANGELOG_KEEP_ENTRIES);
  const archived = entries.slice(CHANGELOG_KEEP_ENTRIES);
  writeFileSync(changelogPath, header + kept.join(''));
  const existing = existsSync(archivePath) ? readFileSync(archivePath, 'utf8') : '';
  const archiveHeader = existing.includes('# Changelog archive') ? '' : '# Changelog archive\n\n';
  writeFileSync(archivePath, archiveHeader + existing + archived.join(''));
  logLine('info', 'loop.compacted_changelog', { kept: kept.length, archived: archived.length });
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const agentFlag = process.argv.includes('--agent');
  const pool = getPool();
  try {
    const state = await loadLoopState(pool);
    const now = new Date();
    if (!force && state.next_run_at && new Date(state.next_run_at).getTime() > now.getTime()) {
      logLine('info', 'loop.skip', { mode: state.mode, next_run_at: state.next_run_at });
      return;
    }
    const startedAt = new Date();
    const isDailyPass = state.mode === 'daily';
    logLine('info', 'loop.start', { mode: state.mode, force, agent: agentFlag, is_daily_pass: isDailyPass });

    const results = await runAllScrapers(pool);
    const thickness = await measureThickness(pool, results, startedAt);
    const next = computeNextRun(state, thickness, new Date());
    const { rows: scrapeRows } = await pool.query(
      `SELECT source, status, items_found, items_new, error FROM scrapes WHERE started_at >= $1 ORDER BY id`,
      [startedAt],
    );
    const nextState: LoopState = {
      ...state,
      ...next,
      last_run_at: now,
      last_thickness: thickness,
      last_summary: { thickness, runs: scrapeRows },
    };
    await saveLoopState(pool, nextState);
    const cadence = nextState.mode === 'daily' ? 'daily' : `${BACKOFF_MINUTES[nextState.backoff_index]}m`;
    logLine('info', 'loop.done', { thickness, mode: nextState.mode, cadence, next_run_at: nextState.next_run_at });

    const shouldRunAgent = agentFlag || isDailyPass || AGENT_EVERY_PASS;
    if (shouldRunAgent) {
      compactChangelog();
      const signals = await collectImprovementSignals(pool);
      logLine('info', 'loop.agent_start', { signals });
      try {
        await runAgentHandoff(buildImprovePrompt(signals));
        logLine('info', 'loop.agent_done', {});
      } catch (err) {
        logLine('warn', 'loop.agent_failed', { error: err instanceof Error ? err.message : String(err) });
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  logLine('error', 'loop.failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
