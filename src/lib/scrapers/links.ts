import type { Pool } from 'pg';
import { createHash } from 'node:crypto';

export async function upsertDjLink(pool: Pool, djId: string, type: string, url: string, label?: string): Promise<void> {
  const id = `${djId}-${type}-${createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
  const cleanLabel = (label ?? '').replace(url, '').replace(/https?:\/\/\S+/g, '').replace(/[:\s]+$/g, '').trim() || null;
  await pool.query(
    `INSERT INTO dj_links (id, dj_id, type, url, label) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [id, djId, type, url, cleanLabel],
  );
}
