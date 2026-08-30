import { writeFileSync } from 'node:fs';
import { getPool } from './lib/db.mjs';

const pool = getPool();
const djs = (
  await pool.query(
    `SELECT d.*,
            (CASE WHEN d.bio IS NOT NULL THEN 15 ELSE 0 END) +
            (CASE WHEN cardinality(d.genres) > 0 THEN 5 ELSE 0 END) +
            (CASE WHEN d.image_url IS NOT NULL THEN 10 ELSE 0 END) +
            (CASE WHEN d.soundcloud_url IS NOT NULL OR d.instagram_url IS NOT NULL OR d.facebook_url IS NOT NULL
                   OR d.website_url IS NOT NULL OR d.mixcloud_url IS NOT NULL THEN 10 ELSE 0 END) +
            (SELECT LEAST(30, count(*)::int * 10) FROM dj_mixes m WHERE m.dj_id = d.id) +
            (SELECT LEAST(20, count(*)::int * 5) FROM event_djs ed WHERE ed.dj_id = d.id) +
            (SELECT LEAST(10, count(*)::int * 5) FROM dj_articles a WHERE a.dj_id = d.id) AS data_completeness,
            (SELECT count(*)::int FROM event_djs ed JOIN events e ON e.id = ed.event_id WHERE ed.dj_id = d.id AND e.starts_at > now()) AS upcoming_events,
            (SELECT count(*)::int FROM dj_mixes m WHERE m.dj_id = d.id) AS mix_count,
            (SELECT count(*)::int FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS past_gig_count,
            (SELECT max(e2.starts_at)::text FROM event_djs ed2 JOIN events e2 ON e2.id = ed2.event_id WHERE ed2.dj_id = d.id AND e2.starts_at <= now()) AS last_played_at
     FROM djs d WHERE d.opt_out = FALSE AND d.active = TRUE AND d.is_nz = TRUE`,
  )
).rows;
const events = (
  await pool.query(
    `SELECT e.id, e.name, e.venue, e.starts_at, e.url, e.archive_url, e.source, e.dj_id, e.is_dj_event, d.name AS dj_name
     FROM events e LEFT JOIN djs d ON d.id = e.dj_id`,
  )
).rows;
const links = (await pool.query('SELECT id, dj_id, type, url, label, archive_url FROM dj_links')).rows;
const articles = (await pool.query('SELECT id, dj_id, title, url, source, published_at, snippet, archive_url FROM dj_articles')).rows;
const mixes = (await pool.query('SELECT id, dj_id, title, url, platform FROM dj_mixes')).rows;
const eventDjs = (await pool.query('SELECT event_id, dj_id FROM event_djs')).rows;
const venues = (await pool.query('SELECT id, name, address, url FROM venues')).rows;
const orgs = (await pool.query('SELECT id, name, city, description, website, instagram, facebook FROM orgs')).rows;
const soundsystems = (await pool.query('SELECT id, name, city, style, description, website FROM soundsystems')).rows;
writeFileSync(
  new URL('../src/data/snapshot.json', import.meta.url),
  JSON.stringify({ exportedAt: new Date().toISOString(), djs, events, links, articles, mixes, eventDjs, venues, orgs, soundsystems }, null, 2),
);
console.log(`Snapshot written: ${djs.length} DJs, ${events.length} events, ${eventDjs.length} event-DJ links, ${venues.length} venues, ${links.length} links, ${articles.length} articles, ${mixes.length} mixes, ${orgs.length} orgs, ${soundsystems.length} soundsystems.`);
await pool.end();
