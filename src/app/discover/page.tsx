import { DjCard } from '@/components/dj-card';
import Link from 'next/link';
import { listDjs } from '@/lib/queries';
import { hasSpecificGenre } from '@/lib/genres';
import { genrePill } from '@/lib/genres';
import { cityFromLocation } from '@/lib/locations';
import { profileTier } from '@/lib/profile-tier';

export const dynamic = 'force-dynamic';

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city: cityFilter } = await searchParams;
  const all = await listDjs();
  const inCity = cityFilter
    ? all.filter((dj) => {
        const city = cityFromLocation(dj.profile_location ?? null) ?? (dj.city && dj.city !== '' ? dj.city : null);
        return city?.toLowerCase() === cityFilter.toLowerCase();
      })
    : [];
  const withGenres = all.filter((dj) => hasSpecificGenre(dj.genres));
  const genreCounts = new Map<string, number>();
  for (const dj of withGenres) {
    for (const genre of dj.genres.slice(0, 5)) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }
  const genres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const cityCounts = new Map<string, number>();
  for (const dj of all) {
    const city = cityFromLocation(dj.profile_location ?? null) ?? (dj.city && dj.city !== '' ? dj.city : null);
    if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
  }
  const cities = [...cityCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const fullProfiles = [...all].sort((a, b) => (profileTier(a) === 'tier1' ? -1 : 1) - (profileTier(b) === 'tier1' ? -1 : 1) || b.data_completeness - a.data_completeness)
    .filter((dj) => profileTier(dj) === 'tier1')
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-black text-foreground">Discover</h1>
      <p className="mt-2 font-mono text-xs text-muted">
        {cityFilter ? `DJs in ${cities.find(([name]) => name.toLowerCase() === cityFilter.toLowerCase())?.[0] ?? cityFilter}` : 'Browse the directory by sound or city'}
      </p>

      {cityFilter && (
        <>
          <h2 className="mt-10 text-xl font-bold text-foreground">{cities.find(([name]) => name.toLowerCase() === cityFilter.toLowerCase())?.[0] ?? cityFilter}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inCity.slice(0, 12).map((dj) => <DjCard key={dj.id} dj={dj} />)}
          </div>
        </>
      )}

      <h2 className="mt-10 text-xl font-bold text-foreground">By genre</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {genres.map(([genre, count]) => (
          <Link
            key={genre}
            href={`/djs?genre=${encodeURIComponent(genre)}`}
            className={`rounded-full px-3 py-1 font-mono text-xs transition-opacity hover:opacity-80 ${genrePill(genre)}`}
          >
            {genre} · {count}
          </Link>
        ))}
      </div>

      <h2 className="mt-12 text-xl font-bold text-foreground">By city</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {cities.map(([city, count]) => (
          <Link
            key={city}
            href={`/discover?city=${encodeURIComponent(city)}`}
            className="rounded-full border border-edge px-3 py-1 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {city} · {count}
          </Link>
        ))}
      </div>

      <h2 className="mt-12 text-xl font-bold text-foreground">Full profiles</h2>
      <p className="mt-1 font-mono text-xs text-muted">The most complete dossiers — bio, mixes, gigs, sources and all.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fullProfiles.map((dj) => <DjCard key={dj.id} dj={dj} />)}
      </div>
    </div>
  );
}
