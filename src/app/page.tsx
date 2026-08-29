import Link from 'next/link';
import { DjCard } from '@/components/dj-card';
import { SearchBox } from '@/components/search-box';
import { getPopularDjs, getUpcomingEvents, getGenres, listDjs } from '@/lib/queries';
import { hasSpecificGenre } from '@/lib/genres';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [popular, events, genres, all] = await Promise.all([
    getPopularDjs(8),
    getUpcomingEvents(5),
    getGenres(),
    listDjs(),
  ]);
  const listed = all.filter((dj) => hasSpecificGenre(dj.genres));

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-20 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Aotearoa New Zealand</p>
        <h1 className="mt-4 text-5xl font-black tracking-tight text-foreground sm:text-7xl">
          New Zealand <span className="text-accent">DJs</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-muted">
          The open directory of DJs across Aotearoa New Zealand. Bios, mixes, socials and upcoming gigs, pulled from public sources and updated daily.
        </p>
        <div className="mx-auto mt-8 max-w-xl">
          <SearchBox autoFocus />
        </div>
        <div className="mt-6 flex justify-center gap-6 font-mono text-xs text-muted">
          <span>{listed.length} DJs listed</span>
          <span>{events.length}+ upcoming gigs</span>
          <span>{genres.length} genres</span>
        </div>
      </section>

      <section className="pb-16">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-2xl font-bold text-foreground">Popular right now</h2>
          <Link href="/discover" className="font-mono text-xs text-accent hover:underline">discover →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {popular.map((dj) => <DjCard key={dj.id} dj={dj} />)}
        </div>
      </section>

      <section className="pb-16">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-2xl font-bold text-foreground">Next gigs</h2>
          <Link href="/events" className="font-mono text-xs text-accent hover:underline">calendar →</Link>
        </div>
        <ul className="divide-y divide-edge rounded-lg border border-edge">
          {events.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm text-foreground">{event.name}</p>
                <p className="font-mono text-xs text-muted">
                  {event.venue ?? 'TBC'} · {new Date(event.starts_at).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
              </div>
              {event.dj_id && (
                <Link href={`/djs/${event.dj_id}`} className="font-mono text-xs text-accent hover:underline">
                  {event.dj_name}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
