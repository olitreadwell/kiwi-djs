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
            (SELECT count(*)::int FROM events e WHERE e.dj_id = d.id AND e.starts_at > now()) AS upcoming_events,
            (SELECT max(e2.starts_at)::text FROM events e2 WHERE e2.dj_id = d.id AND e2.starts_at <= now()) AS last_played_at
     FROM djs d WHERE d.opt_out = FALSE AND d.active = TRUE AND d.is_nz = TRUE`,
  )
).rows;
const events = (
  await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.source, e.dj_id, d.name AS dj_name
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id`,
  )
).rows;
const links = (await pool.query('SELECT id, dj_id, type, url, label FROM dj_links')).rows;
const articles = (await pool.query('SELECT id, dj_id, title, url, source, published_at, snippet FROM dj_articles')).rows;
const mixes = (await pool.query('SELECT id, dj_id, title, url, platform FROM dj_mixes')).rows;
const venues = (await pool.query('SELECT id, name, address, url FROM venues')).rows;
writeFileSync(
  new URL('../src/data/snapshot.json', import.meta.url),
  JSON.stringify({ exportedAt: new Date().toISOString(), djs, events, links, articles, mixes, venues }, null, 2),
);
console.log(`Snapshot written: ${djs.length} DJs, ${events.length} events, ${venues.length} venues, ${links.length} links, ${articles.length} articles, ${mixes.length} mixes.`);
await pool.end();
