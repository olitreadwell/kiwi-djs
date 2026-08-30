import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getPool } from '@/lib/db';
import { isDbMode } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const MAX_PER_IP_PER_HOUR = 30;

// Community feedback on which link is the right profile for a DJ (#74).
// One vote per visitor per link — re-voting flips the stored vote.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { linkId?: string; helpful?: boolean };
  const linkId = (body.linkId ?? '').trim();
  if (!linkId || typeof body.helpful !== 'boolean') {
    return NextResponse.json({ error: 'linkId and helpful (boolean) are required' }, { status: 400 });
  }
  if (!isDbMode) {
    return NextResponse.json({ ok: false, error: 'Feedback requires DATABASE_URL to be configured', mode: 'snapshot' }, { status: 503 });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 16);
  const pool = getPool();
  const link = await pool.query('SELECT 1 FROM dj_links WHERE id = $1', [linkId]);
  if (link.rows.length === 0) return NextResponse.json({ error: 'Unknown link' }, { status: 404 });
  const recent = await pool.query(
    `SELECT count(*)::int AS n FROM link_feedback WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`,
    [ipHash],
  );
  if (recent.rows[0].n >= MAX_PER_IP_PER_HOUR) {
    return NextResponse.json({ error: 'Too much feedback — try again later' }, { status: 429 });
  }
  await pool.query(
    `INSERT INTO link_feedback (link_id, helpful, ip_hash) VALUES ($1, $2, $3)
     ON CONFLICT (link_id, ip_hash) DO UPDATE SET helpful = EXCLUDED.helpful, created_at = now()`,
    [linkId, body.helpful, ipHash],
  );
  const counts = await pool.query(
    `SELECT count(*) FILTER (WHERE helpful)::int AS helpful, count(*) FILTER (WHERE NOT helpful)::int AS unhelpful
     FROM link_feedback WHERE link_id = $1`,
    [linkId],
  );
  return NextResponse.json({ ok: true, ...counts.rows[0] });
}
