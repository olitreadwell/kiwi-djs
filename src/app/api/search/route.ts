import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { isDbMode } from '@/lib/queries';
import snapshot from '@/data/snapshot.json';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { query?: string };
  const query = (body.query ?? '').trim().slice(0, 100);
  if (!query) return NextResponse.json({ ok: true });
  if (!isDbMode) {
    const results = (snapshot.djs as Array<{ name: string; bio: string | null; genres: string[] }>).filter((dj) =>
      `${dj.name} ${dj.bio ?? ''} ${dj.genres.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
    ).length;
    return NextResponse.json({ ok: true, results, mode: 'snapshot' });
  }
  const pool = getPool();
  const result = await pool.query(
    `SELECT count(*)::int AS results FROM djs
     WHERE opt_out = FALSE AND (name ILIKE $1 OR bio ILIKE $1 OR array_to_string(genres, ' ') ILIKE $1)`,
    [`%${query}%`],
  );
  await pool.query(`INSERT INTO search_events (query, results) VALUES ($1, $2)`, [query, result.rows[0].results]);
  return NextResponse.json({ ok: true, results: result.rows[0].results });
}
