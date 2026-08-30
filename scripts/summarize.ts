// One-off AI summarisation pass: generate short + long summaries for DJs
// missing them, most information-rich first. Usage:
//   pnpm summarize            (default 20 per run)
//   pnpm summarize -- 100     (limit)
import { getPool } from './lib/db.mjs';
import { summarizeMissingDjs } from '../src/lib/summarize';

async function main(): Promise<void> {
  const limit = Number(process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? 20);
  const pool = getPool();
  const done = await summarizeMissingDjs(pool, limit);
  console.log(`Summarised ${done} DJs.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
