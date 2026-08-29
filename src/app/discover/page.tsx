import { DjCard } from '@/components/dj-card';
import { getPopularDjs, listDjs } from '@/lib/queries';
import { hasSpecificGenre } from '@/lib/genres';

export const dynamic = 'force-dynamic';

export default async function DiscoverPage() {
  const [popular, all] = await Promise.all([getPopularDjs(12), listDjs()]);
  const withGenres = all.filter((dj) => hasSpecificGenre(dj.genres));
  const recentlyAdded = [...withGenres].sort((a, b) => b.data_completeness - a.data_completeness).slice(0, 6);
  const needsData = withGenres.filter((dj) => dj.data_completeness < 40).slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-black text-stone-100">Discover</h1>
      <p className="mt-2 font-mono text-xs text-stone-500">Who&apos;s moving the room right now</p>

      <h2 className="mt-10 text-xl font-bold text-stone-100">Most played profiles</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {popular.map((dj) => <DjCard key={dj.id} dj={dj} />)}
      </div>

      <h2 className="mt-12 text-xl font-bold text-stone-100">Best documented</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recentlyAdded.map((dj) => <DjCard key={dj.id} dj={dj} />)}
      </div>

      <h2 className="mt-12 text-xl font-bold text-stone-100">Needs more data</h2>
      <p className="mt-1 font-mono text-xs text-stone-500">
        Searched often but thin on details. The self-improvement loop targets these next.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {needsData.map((dj) => <DjCard key={dj.id} dj={dj} />)}
      </div>
    </div>
  );
}
