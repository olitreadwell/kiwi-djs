import { DjGrid } from '@/components/dj-grid';
import { GenreFilter } from '@/components/genre-filter';
import { SearchBox } from '@/components/search-box';
import { getGenres, listDjs } from '@/lib/queries';
import { hasSpecificGenre } from '@/lib/genres';
import { SortSelect } from '@/components/sort-select';

export const dynamic = 'force-dynamic';

export default async function DjsPage({ searchParams }: { searchParams: Promise<{ q?: string; genre?: string; sort?: string }> }) {
  const params = await searchParams;
  const [djs, genres] = await Promise.all([
    listDjs({ query: params.q, genre: params.genre, sort: params.sort }),
    getGenres(),
  ]);
  const listed = djs.filter((dj) => hasSpecificGenre(dj.genres));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-black text-foreground">All DJs</h1>
      <p className="mt-2 font-mono text-xs text-muted">{listed.length} result{listed.length === 1 ? '' : 's'}</p>
      <div className="mt-6 space-y-4">
        <SearchBox />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <GenreFilter genres={genres} />
          <SortSelect current={params.sort ?? 'completeness'} />
        </div>
      </div>
      <div className="mt-8">
        <DjGrid djs={listed} />
      </div>
      {listed.length === 0 && (
        <p className="mt-16 text-center font-mono text-sm text-muted">No DJs match. Try another search.</p>
      )}
    </div>
  );
}
