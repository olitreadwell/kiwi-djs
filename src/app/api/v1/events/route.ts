import { NextResponse } from 'next/server';
import { getEvents } from '@/lib/queries';
import type { ListResponse } from '@/lib/api-types';
import type { EventRow } from '@/lib/queries';
import { eventListQuerySchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = eventListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query params', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const upcoming = parsed.data.upcoming !== 'false';
  const venue = parsed.data.venue ?? undefined;
  const dj = parsed.data.dj ?? undefined;
  const limit = parsed.data.limit ?? 100;
  const events = await getEvents({ upcoming, venue, dj, limit });
  const body: ListResponse<EventRow> = { data: events, meta: { total: events.length, limit, offset: 0 } };
  return NextResponse.json(body);
}
