import { NextResponse } from 'next/server';
import {
  buildDossier,
  getDjArticles,
  getDjById,
  getDjCollabs,
  getDjGigs,
  getDjLabels,
  getDjLinks,
  getDjMixes,
  getDjPastGigs,
  getSimilarDjs,
} from '@/lib/queries';
import { toDjSummary } from '@/lib/api-types';
import type { DjDetail } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dj, upcoming, past, mixes, articles, links, collabs, labels, similar, summary] = await Promise.all([
    getDjById(id),
    getDjGigs(id),
    getDjPastGigs(id),
    getDjMixes(id),
    getDjArticles(id),
    getDjLinks(id),
    getDjCollabs(id),
    getDjLabels(id),
    getSimilarDjs(id),
    buildDossier(id),
  ]);
  if (!dj) return NextResponse.json({ error: 'DJ not found' }, { status: 404 });
  const detail: DjDetail = {
    ...toDjSummary(dj),
    summary,
    links,
    mixes,
    articles,
    collabs,
    labels,
    similar,
    upcoming_gigs: upcoming,
    past_gigs: past,
  };
  return NextResponse.json({ data: detail });
}
