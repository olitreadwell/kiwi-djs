import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventLineup, getVenueById, getVenueEvents } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const venue = await getVenueById(slug);
  if (!venue) notFound();

  const events = await getVenueEvents(venue.name, 30);
  const lineups = await Promise.all(events.map((event) => getEventLineup(event.id)));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link href="/venues" className="font-mono text-xs text-muted hover:text-accent">← all venues</Link>
      <h1 className="mt-4 text-3xl font-black text-foreground">{venue.name}</h1>
      <p className="mt-2 font-mono text-xs text-muted">
        {venue.address ?? 'address tbc'}
        {venue.region ? ` · ${venue.region}` : ''}
      </p>
      {venue.url && (
        <a href={venue.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-mono text-xs text-accent hover:underline">
          venue site ↗
        </a>
      )}

      <h2 className="mt-10 text-xl font-bold text-foreground">Upcoming lineup</h2>
      {events.length === 0 ? (
        <p className="mt-3 font-mono text-sm text-muted">No upcoming gigs listed yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-edge rounded-lg border border-edge">
          {events.map((event, index) => (
            <li key={event.id} className="px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <Link href={`/events/${event.id}`} className="text-sm font-semibold text-foreground transition-colors hover:text-accent">
                  {event.name}
                </Link>
                <p className="font-mono text-xs text-muted">
                  {new Date(event.starts_at).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
              </div>
              {lineups[index].length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {lineups[index].map((dj) => (
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
              {event.url && (
                <a href={event.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-mono text-xs text-faint hover:text-accent">
                  source ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
