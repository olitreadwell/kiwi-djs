import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getPool } from '@/lib/db';
import { isDbMode } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const FIELDS = ['bio', 'genres', 'mixes', 'socials', 'photo', 'events', 'other'];
const MAX_PER_IP_PER_HOUR = 5;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    djId?: string;
    djName?: string;
    field?: string;
    currentValue?: string;
    suggestedValue?: string;
    sourceUrl?: string;
    note?: string;
  };
  const field = (body.field ?? '').trim().toLowerCase();
  const suggestedValue = (body.suggestedValue ?? '').trim();
  if (!FIELDS.includes(field)) return NextResponse.json({ error: 'field must be one of: ' + FIELDS.join(', ') }, { status: 400 });
  if (suggestedValue.length < 3 || suggestedValue.length > 2000) {
    return NextResponse.json({ error: 'suggestedValue must be 3-2000 chars' }, { status: 400 });
  }
  if (!isDbMode) {
    return NextResponse.json({ ok: false, error: 'Suggestions require DATABASE_URL to be configured', mode: 'snapshot' }, { status: 503 });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 16);
  const pool = getPool();
  const recent = await pool.query(
    `SELECT count(*)::int AS n FROM suggestions WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`,
    [ipHash],
  );
  if (recent.rows[0].n >= MAX_PER_IP_PER_HOUR) {
    return NextResponse.json({ error: 'Too many suggestions — try again later' }, { status: 429 });
  }
  await pool.query(
    `INSERT INTO suggestions (dj_id, dj_name, field, current_value, suggested_value, source_url, note, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      body.djId?.trim() || null,
      body.djName?.trim() || null,
      field,
      body.currentValue?.trim() || null,
      suggestedValue,
      body.sourceUrl?.trim() || null,
      body.note?.trim() || null,
      ipHash,
    ],
  );
  return NextResponse.json({ ok: true });
}
