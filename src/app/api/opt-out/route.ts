import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { isDbMode } from '@/lib/queries';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { djId?: string };
  const djId = (body.djId ?? '').trim().toLowerCase();
  if (!djId) return NextResponse.json({ error: 'djId required' }, { status: 400 });
  if (!isDbMode) {
    return NextResponse.json({ ok: false, error: 'Opt-out requires DATABASE_URL to be configured', mode: 'snapshot' }, { status: 503 });
  }
  const pool = getPool();
  const result = await pool.query(`UPDATE djs SET opt_out = TRUE WHERE id = $1 RETURNING id`, [djId]);
  if (result.rows.length === 0) return NextResponse.json({ error: 'DJ not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
