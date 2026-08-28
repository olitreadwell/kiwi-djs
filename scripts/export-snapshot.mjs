import { writeFileSync } from 'node:fs';
import { getPool } from './lib/db.mjs';

const pool = getPool();
const djs = (
  await pool.query(
    `SELECT d.*,
            (CASE WHEN d.bio IS NOT NULL THEN 15 ELSE 0 END) +
            (CASE WHEN cardinality(d.genres) > 0 THEN 15 ELSE 0 END) +
            (CASE WHEN d.image_url IS NOT NULL THEN 15 ELSE 0 END) +
            (CASE WHEN d.soundcloud_url IS NOT NULL THEN 10 ELSE 0 END) +
            (CASE WHEN d.instagram_url IS NOT NULL THEN 10 ELSE 0 END) +
            (CASE WHEN d.facebook_url IS NOT NULL THEN 10 ELSE 0 END) +
            (CASE WHEN d.website_url IS NOT NULL THEN 10 ELSE 0 END) +
            (CASE WHEN d.mixcloud_url IS NOT NULL THEN 5 ELSE 0 END) AS data_completeness,
            (SELECT count(*)::int FROM events e WHERE e.dj_id = d.id AND e.starts_at > now()) AS upcoming_events
     FROM djs d WHERE d.opt_out = FALSE`,
  )
).rows;
const events = (
  await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id`,
  )
).rows;
writeFileSync(
  new URL('../src/data/snapshot.json', import.meta.url),
  JSON.stringify({ exportedAt: new Date().toISOString(), djs, events }, null, 2),
);
console.log(`Snapshot written: ${djs.length} DJs, ${events.length} events.`);
await pool.end();
