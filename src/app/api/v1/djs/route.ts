import { NextResponse } from 'next/server';
import { listDjs } from '@/lib/queries';
import { toDjSummary } from '@/lib/api-types';
import type { ListResponse, DjSummary } from '@/lib/api-types';
import { djListQuerySchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = djListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query params', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { q, genre, limit = 50, offset = 0 } = parsed.data;
  const all = await listDjs({ query: q, genre });
  const page = all.slice(offset, offset + limit);
  const body: ListResponse<DjSummary> = {
    data: page.map(toDjSummary),
    meta: { total: all.length, limit, offset },
  };
  return NextResponse.json(body);
}
