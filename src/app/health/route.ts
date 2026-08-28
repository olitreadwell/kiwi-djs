import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { isDbMode } from '@/lib/queries';
import snapshot from '@/data/snapshot.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!isDbMode) {
      return NextResponse.json({
        status: 'ok',
        mode: 'snapshot',
        djs: (snapshot.djs as unknown[]).length,
        time: new Date().toISOString(),
        note: 'Set DATABASE_URL to enable live data, scrapers and analytics',
      });
    }
    const pool = getPool();
    const result = await pool.query('SELECT count(*)::int AS djs FROM djs');
    return NextResponse.json({ status: 'ok', mode: 'postgres', djs: result.rows[0].djs, time: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ status: 'error', error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
