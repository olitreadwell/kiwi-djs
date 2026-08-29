import { buildDataset } from '@/lib/dataset';

export const dynamic = 'force-dynamic';

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: Request) {
  const { dataset, version } = await buildDataset();
  const etag = `"${version}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag, 'cache-control': 'public, max-age=3600' } });
  }
  const header = ['id', 'name', 'genres', 'bio', 'soundcloud_url', 'instagram_url', 'facebook_url', 'mixcloud_url', 'website_url', 'popularity', 'data_completeness', 'upcoming_events'];
  const rows = dataset.djs.map((dj) =>
    [dj.id, dj.name, dj.genres.join('; '), dj.bio, dj.soundcloud_url, dj.instagram_url, dj.facebook_url, dj.mixcloud_url, dj.website_url, dj.popularity, dj.data_completeness, dj.upcoming_events]
      .map(csvCell)
      .join(','),
  );
  return new Response([header.join(','), ...rows].join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="wellington-djs.csv"',
      etag,
      'cache-control': 'public, max-age=3600',
    },
  });
}
