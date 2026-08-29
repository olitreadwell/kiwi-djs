import { NextResponse } from 'next/server';
import { listDjs } from '@/lib/queries';
import { toDjSummary } from '@/lib/api-types';
import type { ListResponse, DjSummary } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ error: 'q is required' }, { status: 400 });
  const results = await listDjs({ query: q });
  const body: ListResponse<DjSummary> = {
    data: results.slice(0, 50).map(toDjSummary),
    meta: { total: results.length, limit: 50, offset: 0 },
  };
  return NextResponse.json(body);
}
