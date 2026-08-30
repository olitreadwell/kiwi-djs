import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getPool } from '@/lib/db';
import { isDbMode } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const MAX_PER_IP_PER_HOUR = 30;
const LEDGER_PATH = 'data/link-votes.json';
const GITHUB_REPO = process.env.GITHUB_REPO ?? 'olitreadwell/nz-djs';

interface LedgerEntry {
  helpful: number;
  unhelpful: number;
  ips: Record<string, boolean>;
}

interface Ledger {
  votes: Record<string, LedgerEntry>;
}

async function readLedger(token: string): Promise<{ ledger: Ledger; sha: string | null }> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${LEDGER_PATH}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'nz-djs' },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return { ledger: { votes: {} }, sha: null };
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const data = (await res.json()) as { content?: string; sha?: string };
  const decoded = Buffer.from(data.content ?? '', 'base64').toString('utf8');
  let ledger: Ledger = { votes: {} };
  try {
    ledger = JSON.parse(decoded) as Ledger;
  } catch {
    ledger = { votes: {} };
  }
  return { ledger, sha: data.sha ?? null };
}

async function writeLedger(token: string, sha: string | null, ledger: Ledger): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${LEDGER_PATH}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'nz-djs', 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'chore: link vote',
      content: Buffer.from(JSON.stringify(ledger, null, 2)).toString('base64'),
      ...(sha ? { sha } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`GitHub write failed: ${res.status}`);
}

// Snapshot-mode fallback: votes live in a repo JSON ledger via the GitHub
// API (no Postgres needed). The loop merges the ledger into the snapshot
// so the best-link picker self-corrects. Requires GITHUB_TOKEN in env.
async function voteViaLedger(linkId: string, helpful: boolean, ipHash: string): Promise<{ helpful: number; unhelpful: number }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('no GITHUB_TOKEN');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { ledger, sha } = await readLedger(token);
    const entry = (ledger.votes[linkId] ??= { helpful: 0, unhelpful: 0, ips: {} });
    const previous = entry.ips[ipHash];
    if (previous === true) entry.helpful -= 1;
    if (previous === false) entry.unhelpful -= 1;
    entry.ips[ipHash] = helpful;
    if (helpful) entry.helpful += 1;
    else entry.unhelpful += 1;
    try {
      await writeLedger(token, sha, ledger);
      return { helpful: entry.helpful, unhelpful: entry.unhelpful };
    } catch {
      // 409 conflict — re-read and retry
    }
  }
  throw new Error('GitHub ledger write conflicted 3 times');
}

// Community feedback on which link is the right profile for a DJ (#74).
// One vote per visitor per link — re-voting flips the stored vote.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { linkId?: string; helpful?: boolean };
  const linkId = (body.linkId ?? '').trim();
  if (!linkId || typeof body.helpful !== 'boolean') {
    return NextResponse.json({ error: 'linkId and helpful (boolean) are required' }, { status: 400 });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 16);
  if (!isDbMode) {
    try {
      const counts = await voteViaLedger(linkId, body.helpful, ipHash);
      return NextResponse.json({ ok: true, ...counts });
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Feedback needs DATABASE_URL or GITHUB_TOKEN configured', mode: 'snapshot' },
        { status: 503 },
      );
    }
  }
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
