import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { isDbMode } from '@/lib/queries';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDbMode) return NextResponse.json({ ok: true, mode: 'snapshot' });
  const pool = getPool();
  await pool.query(`INSERT INTO profile_views (dj_id) VALUES ($1)`, [id]);
  await pool.query(`UPDATE djs SET popularity = popularity + 1 WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
