import Link from 'next/link';
import { DjCard } from '@/components/dj-card';
import { SearchBox } from '@/components/search-box';
import { getEventLineup, getPopularDjs, getUpcomingEvents, getGenres, getWeekendEvents, listDjs } from '@/lib/queries';
import { hasSpecificGenre } from '@/lib/genres';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [popular, events, genres, all, weekend] = await Promise.all([
    getPopularDjs(8),
    getUpcomingEvents(5),
    getGenres(),
    listDjs(),
    getWeekendEvents(30),
  ]);
  const listed = all.filter((dj) => hasSpecificGenre(dj.genres));
  const weekendLineups = await Promise.all(weekend.map((event) => getEventLineup(event.id)));
  const lineupByEvent = new Map(weekend.map((event, index) => [event.id, weekendLineups[index]]));
  const weekendByDay = new Map<string, typeof weekend>();
  for (const event of weekend) {
    const day = new Date(event.starts_at).toDateString();
    const bucket = weekendByDay.get(day) ?? [];
    bucket.push(event);
    weekendByDay.set(day, bucket);
  }

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-20 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Aotearoa</p>
        <h1 className="mt-4 text-5xl font-black tracking-tight text-foreground sm:text-7xl">
          Aotearoa <span className="text-accent">DJs</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-muted">
          The open directory of DJs across Aotearoa. Bios, mixes, socials and upcoming gigs, pulled from public sources and updated daily.
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

      {weekend.length > 0 && (
        <section className="pb-16">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-2xl font-bold text-foreground">Who&apos;s playing this weekend</h2>
            <Link href="/events" className="font-mono text-xs text-accent hover:underline">calendar →</Link>
          </div>
          <div className="space-y-6">
            {[...weekendByDay.entries()].map(([day, dayEvents]) => (
              <div key={day}>
                <h3 className="font-mono text-xs uppercase tracking-wider text-accent">
                  {new Date(day).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <ul className="mt-3 divide-y divide-edge rounded-lg border border-edge">
                  {dayEvents.map((event) => (
                    <li key={event.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <Link href={`/events/${event.id}`} className="text-sm text-foreground transition-colors hover:text-accent">
                          {event.name}
                        </Link>
                        <p className="font-mono text-xs text-muted">{event.venue ?? 'TBC'}</p>
                      </div>
                      {lineupByEvent.get(event.id) && lineupByEvent.get(event.id)!.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {lineupByEvent.get(event.id)!.map((dj) => (
                            <Link
                              key={dj.id}
                              href={`/djs/${dj.id}`}
                              className="rounded-full border border-edge px-2.5 py-0.5 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                            >
                              {dj.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

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
                <Link href={`/events/${event.id}`} className="text-sm text-foreground transition-colors hover:text-accent">
                  {event.name}
                </Link>
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
