import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { runAllScrapers } from '@/lib/scrapers/run-all';
import { isDbMode } from '@/lib/queries';

export const maxDuration = 300;

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isDbMode) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'DATABASE_URL not configured' });
  }
  const pool = getPool();
  try {
    const results = await runAllScrapers(pool);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  } finally {
    await pool.end();
  }
}

export const GET = handle;
export const POST = handle;
