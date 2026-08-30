import type { Pool } from 'pg';
import { createHash } from 'node:crypto';

export async function upsertDjLink(
  pool: Pool,
  djId: string,
  type: string,
  url: string,
  label?: string,
  followers?: number,
  trackCount?: number,
): Promise<void> {
  const id = `${djId}-${type}-${createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
  const cleanLabel = (label ?? '').replace(url, '').replace(/https?:\/\/\S+/g, '').replace(/[:\s]+$/g, '').trim() || null;
  await pool.query(
    `INSERT INTO dj_links (id, dj_id, type, url, label, followers, track_count) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       label = COALESCE(EXCLUDED.label, dj_links.label),
       followers = CASE WHEN EXCLUDED.followers > 0 THEN EXCLUDED.followers ELSE dj_links.followers END,
       track_count = CASE WHEN EXCLUDED.track_count > 0 THEN EXCLUDED.track_count ELSE dj_links.track_count END`,
    [id, djId, type, url, cleanLabel, followers ?? 0, trackCount ?? 0],
  );
}
