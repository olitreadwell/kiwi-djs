import { DjCard } from '@/components/dj-card';
import { GenreFilter } from '@/components/genre-filter';
import { SearchBox } from '@/components/search-box';
import { getGenres, listDjs } from '@/lib/queries';
import { hasSpecificGenre } from '@/lib/genres';

export const dynamic = 'force-dynamic';

export default async function DjsPage({ searchParams }: { searchParams: Promise<{ q?: string; genre?: string }> }) {
  const params = await searchParams;
  const [djs, genres] = await Promise.all([
    listDjs({ query: params.q, genre: params.genre }),
    getGenres(),
  ]);
  const listed = djs.filter((dj) => hasSpecificGenre(dj.genres));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-black text-stone-100">All DJs</h1>
      <p className="mt-2 font-mono text-xs text-stone-500">{listed.length} result{listed.length === 1 ? '' : 's'}</p>
      <div className="mt-6 space-y-4">
        <SearchBox />
        <GenreFilter genres={genres} />
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listed.map((dj) => <DjCard key={dj.id} dj={dj} />)}
      </div>
      {listed.length === 0 && (
        <p className="mt-16 text-center font-mono text-sm text-stone-500">No DJs match. Try another search.</p>
      )}
    </div>
  );
}
