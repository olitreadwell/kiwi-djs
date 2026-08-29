import { NextResponse } from 'next/server';
import { buildDataset } from '@/lib/dataset';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { dataset, version } = await buildDataset();
  const etag = `"${version}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag, 'cache-control': 'public, max-age=3600' } });
  }
  return NextResponse.json(dataset, { headers: { etag, 'cache-control': 'public, max-age=3600' } });
}
