import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventById, getEventLineup, getVenues } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, lineup, venues] = await Promise.all([getEventById(id), getEventLineup(id), getVenues()]);
  if (!event) notFound();

  const venue = event.venue ? venues.find((candidate) => candidate.name.toLowerCase() === event.venue!.toLowerCase()) : undefined;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/events" className="font-mono text-xs text-muted hover:text-accent">← event calendar</Link>
      <h1 className="mt-4 text-3xl font-black text-foreground">{event.name}</h1>
      <p className="mt-2 font-mono text-xs text-muted">
        {event.starts_at
          ? new Date(event.starts_at).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : 'date tbc'}
        {event.starts_at
          ? ` · ${new Date(event.starts_at).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}`
          : ''}
      </p>
      <p className="mt-1 font-mono text-xs text-muted">
        {venue ? (
          <Link href={`/venues/${venue.id}`} className="text-accent transition-colors hover:underline">
            {event.venue}
          </Link>
        ) : (event.venue ?? 'venue tbc')}
        {event.region ? ` · ${event.region}` : ''}
      </p>
      {event.url && (
        <a href={event.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block rounded-full border border-edge px-4 py-2 font-mono text-xs text-foreground transition-colors hover:border-accent hover:text-accent">
          tickets / source ↗
        </a>
      )}

      <h2 className="mt-10 text-xl font-bold text-foreground">Lineup</h2>
      {lineup.length === 0 ? (
        <p className="mt-3 font-mono text-sm text-muted">No DJs mapped to this event yet.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {lineup.map((dj) => (
            <Link key={dj.id} href={`/djs/${dj.id}`} className="rounded-lg border border-edge bg-surface p-4 transition-colors hover:border-accent/60">
              <p className="text-sm font-semibold text-foreground">{dj.name}</p>
              <p className="mt-1 font-mono text-xs text-muted">{dj.genres.slice(0, 4).join(' / ') || 'genre tbc'}</p>
            </Link>
          ))}
        </div>
      )}

      {event.dj_id && (
        <p className="mt-8 font-mono text-xs text-muted">
          Headliner: <Link href={`/djs/${event.dj_id}`} className="text-accent hover:underline">{event.dj_name}</Link>
        </p>
      )}

      <details className="mt-10 rounded-lg border border-edge">
        <summary className="cursor-pointer px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:text-accent">
          Sources
        </summary>
        <div className="border-t border-edge px-4 py-3 font-mono text-xs text-muted">
          <p>Source: {event.source}</p>
          {event.url && <p className="mt-1">Listing: {event.url}</p>}
        </div>
      </details>
    </div>
  );
}
