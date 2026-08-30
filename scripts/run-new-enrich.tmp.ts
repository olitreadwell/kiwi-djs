import { getPool } from './lib/db.mjs';
import { enrichBeatport } from '../src/lib/scrapers/beatport';
import { enrichBandcamp } from '../src/lib/scrapers/bandcamp';
import { discoverSoundcloudNz } from '../src/lib/scrapers/discover';

async function main() {
  const pool = getPool();
  const beatportDjs = (
    await pool.query(
      `SELECT DISTINCT d.id, d.name FROM dj_links l JOIN djs d ON d.id = l.dj_id
       WHERE l.type = 'beatport' AND d.opt_out = FALSE AND d.is_nz = TRUE
         AND (d.discovery_note IS NULL OR d.discovery_note <> 'junk')`,
    )
  ).rows as Array<{ id: string; name: string }>;
  for (const dj of beatportDjs) {
    const r = await enrichBeatport(pool, dj);
    console.log(`beatport ${dj.name}: ${r.status} found=${r.items_found} ${r.error ?? ''}`);
  }
  const bandcampDjs = (
    await pool.query(
      `SELECT DISTINCT d.id, d.name FROM dj_links l JOIN djs d ON d.id = l.dj_id
       WHERE l.type = 'bandcamp' AND d.opt_out = FALSE AND d.is_nz = TRUE
         AND (d.discovery_note IS NULL OR d.discovery_note <> 'junk')`,
    )
  ).rows as Array<{ id: string; name: string }>;
  for (const dj of bandcampDjs) {
    const r = await enrichBandcamp(pool, dj);
    console.log(`bandcamp ${dj.name}: ${r.status} found=${r.items_found} ${r.error ?? ''}`);
  }
  const nz = await discoverSoundcloudNz(pool);
  console.log(`soundcloud-nz: ${nz.status} found=${nz.items_found} new=${nz.items_new} ${nz.error ?? ''}`);
  await pool.end();
}

void main();
