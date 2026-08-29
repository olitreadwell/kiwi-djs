import { NextResponse } from 'next/server';
import { getVenues } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const venues = await getVenues();
  return NextResponse.json({ data: venues });
}
