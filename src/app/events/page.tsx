import Link from 'next/link';
import { getPastEvents, getUpcomingEvents } from '@/lib/queries';
import { RegionFilter } from '@/components/region-filter';

export const dynamic = 'force-dynamic';

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ region?: string; period?: string }> }) {
  const { region, period } = await searchParams;
  const past = period === 'past';
  const all = past ? await getPastEvents(1500) : await getUpcomingEvents(600);
  const events = region ? all.filter((event) => event.region?.toLowerCase() === region.toLowerCase()) : all;
  const regions = [...new Set(all.map((event) => event.region).filter((value): value is string => Boolean(value)))].sort();
  const byDate = new Map<string, typeof events>();
  for (const event of events) {
    const day = new Date(event.starts_at).toDateString();
    const bucket = byDate.get(day) ?? [];
    bucket.push(event);
    byDate.set(day, bucket);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-black text-foreground">Event calendar</h1>
      <p className="mt-2 font-mono text-xs text-muted">{events.length} {past ? 'past' : 'upcoming'} gigs from public listings</p>
      <div className="mt-4 flex gap-1 font-mono text-xs">
        <Link
          href={region ? `/events?region=${region}` : '/events'}
          aria-current={!past ? 'page' : undefined}
          className={`rounded-full px-3 py-1 transition-colors ${!past ? 'bg-accent text-background' : 'border border-edge text-muted hover:border-accent hover:text-accent'}`}
        >
          Upcoming
        </Link>
        <Link
          href={region ? `/events?region=${region}&period=past` : '/events?period=past'}
          aria-current={past ? 'page' : undefined}
          className={`rounded-full px-3 py-1 transition-colors ${past ? 'bg-accent text-background' : 'border border-edge text-muted hover:border-accent hover:text-accent'}`}
        >
          Past
        </Link>
      </div>
      <div className="mt-4">
        <RegionFilter regions={regions} />
      </div>
      <div className="mt-8 space-y-10">
        {[...byDate.entries()].map(([day, dayEvents]) => (
          <section key={day}>
            <h2 className="font-mono text-sm uppercase tracking-wider text-accent">
              {new Date(day).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <ul className="mt-3 divide-y divide-edge rounded-lg border border-edge">
              {dayEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <Link href={`/events/${event.id}`} className="text-sm text-foreground transition-colors hover:text-accent">
                      {event.name}
                    </Link>
                    <p className="font-mono text-xs text-muted">{event.venue ?? 'TBC'}</p>
                  </div>
                  <div className="text-right">
                    {event.dj_id && (
                      <Link href={`/djs/${event.dj_id}`} className="font-mono text-xs text-accent hover:underline">
                        {event.dj_name}
                      </Link>
                    )}
                    {event.url && (
                      <a href={event.url} target="_blank" rel="noopener noreferrer" className="mt-1 block font-mono text-xs text-muted hover:text-accent">
                        source ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
