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
  // Dedupe across sources: same gig appears on Undertheradar, Rogue & Vagabond
  // (UTR-powered) etc. Match on normalized name + venue within a 24h window.
  if (event.startsAt) {
    const dupe = await pool.query(
      `SELECT id FROM events
       WHERE lower(regexp_replace(name, '[^a-z0-9]', '', 'g')) = $1
         AND venue IS NOT DISTINCT FROM $2
         AND abs(extract(epoch FROM (starts_at - $3::timestamptz))) < 86400
       LIMIT 1`,
      [
        event.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        event.venue ?? null,
        event.startsAt.toISOString(),
      ],
    );
    if (dupe.rows[0]) {
      return false;
    }
  }
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
    `SELECT d.id FROM djs d
     WHERE d.opt_out = FALSE
       AND (
         position(lower(d.name) in lower($1)) > 0
         OR position(lower($1) in lower(d.name)) > 0
         OR EXISTS (
           SELECT 1 FROM dj_aliases a
           WHERE a.dj_id = d.id
             AND (position(lower(a.alias) in lower($1)) > 0 OR position(lower($1) in lower(a.alias)) > 0)
         )
       )
     ORDER BY length(d.name) DESC, (d.active = TRUE) DESC
     LIMIT 1`,
    [eventName],
  );
  if (djMatch.rows[0]) {
    await pool.query(`UPDATE events SET dj_id = $1 WHERE id = $2 AND dj_id IS NULL`, [
      djMatch.rows[0].id,
      eventId,
    ]);
  }
}
