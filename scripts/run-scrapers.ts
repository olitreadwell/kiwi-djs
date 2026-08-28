import { getPool } from './lib/db.mjs';
import { runAllScrapers } from '../src/lib/scrapers/run-all';

async function main() {
  const pool = getPool();
  const results = await runAllScrapers(pool);
  for (const result of results) {
    console.log(`${result.status.padEnd(7)} found=${result.items_found} new=${result.items_new}${result.error ? ` — ${result.error}` : ''}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
