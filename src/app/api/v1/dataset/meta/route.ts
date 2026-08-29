import { NextResponse } from 'next/server';
import { buildDataset } from '@/lib/dataset';
import type { DatasetMeta } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { dataset, version } = await buildDataset();
  const meta: DatasetMeta = {
    version,
    exportedAt: dataset.exportedAt,
    counts: {
      djs: dataset.djs.length,
      events: dataset.events.length,
      venues: dataset.venues.length,
      links: dataset.links.length,
      articles: dataset.articles.length,
      mixes: dataset.mixes.length,
    },
    license: 'Public data only. Opt-out respected — see /opt-out.',
    sources: ['undertheradar', 'sanfran', 'rogue', 'mixcloud', 'bing-news', 'manual'],
  };
  return NextResponse.json(meta, { headers: { 'cache-control': 'public, max-age=3600' } });
}
