import { NextResponse } from 'next/server';
import { listDjs } from '@/lib/queries';
import { toDjSummary } from '@/lib/api-types';
import type { ListResponse, DjSummary } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? undefined;
  const genre = url.searchParams.get('genre') ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);
  const all = await listDjs({ query: q, genre });
  const page = all.slice(offset, offset + limit);
  const body: ListResponse<DjSummary> = {
    data: page.map(toDjSummary),
    meta: { total: all.length, limit, offset },
  };
  return NextResponse.json(body);
}
