import type { Pool } from 'pg';

export interface EventRecord {
  id: string;
  name: string;
  venue?: string;
  startsAt: Date | null;
  url?: string;
  source: string;
}

export async function upsertEvent(pool: Pool, event: EventRecord): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO events (id, name, venue, starts_at, url, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, venue = EXCLUDED.venue, starts_at = EXCLUDED.starts_at, url = EXCLUDED.url
     RETURNING (xmax = 0) AS inserted`,
    [event.id, event.name, event.venue ?? null, event.startsAt, event.url ?? null, event.source],
  );
  return result.rows[0]?.inserted === true;
}

export async function linkDjToEvent(pool: Pool, eventId: string, eventName: string): Promise<void> {
  const djMatch = await pool.query(
    `SELECT id FROM djs
     WHERE opt_out = FALSE AND position(lower(name) in lower($1)) > 0
     ORDER BY length(name) DESC LIMIT 1`,
    [eventName],
  );
  if (djMatch.rows[0]) {
    await pool.query(`UPDATE events SET dj_id = $1 WHERE id = $2 AND dj_id IS NULL`, [
      djMatch.rows[0].id,
      eventId,
    ]);
  }
}
