import { NextResponse } from 'next/server';
import { getEvents } from '@/lib/queries';
import type { ListResponse } from '@/lib/api-types';
import type { EventRow } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const upcoming = url.searchParams.get('upcoming') !== 'false';
  const venue = url.searchParams.get('venue') ?? undefined;
  const dj = url.searchParams.get('dj') ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);
  const events = await getEvents({ upcoming, venue, dj, limit });
  const body: ListResponse<EventRow> = { data: events, meta: { total: events.length, limit, offset: 0 } };
  return NextResponse.json(body);
}
