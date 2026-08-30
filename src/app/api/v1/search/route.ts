import { NextResponse } from 'next/server';
import { listDjs } from '@/lib/queries';
import { toDjSummary } from '@/lib/api-types';
import type { ListResponse, DjSummary } from '@/lib/api-types';
import { searchQuerySchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const parsed = searchQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'q is required' }, { status: 400 });
  const q = parsed.data.q;
  const results = await listDjs({ query: q });
  const body: ListResponse<DjSummary> = {
    data: results.slice(0, 50).map(toDjSummary),
    meta: { total: results.length, limit: 50, offset: 0 },
  };
  return NextResponse.json(body);
}
