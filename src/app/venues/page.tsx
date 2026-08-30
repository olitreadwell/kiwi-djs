import Link from 'next/link';
import { getVenuesWithCounts } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function VenuesPage() {
  const venues = await getVenuesWithCounts();
  const withEvents = venues.filter((venue) => venue.upcoming_events > 0);
  const listed = venues.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-black text-foreground">Venues</h1>
      <p className="mt-2 font-mono text-xs text-muted">
        {listed} venues across Aotearoa, {withEvents.length} with upcoming gigs
      </p>
      <ul className="mt-8 divide-y divide-edge rounded-lg border border-edge">
        {[...withEvents, ...venues.filter((venue) => venue.upcoming_events === 0)].map((venue) => (
          <li key={venue.id}>
            <Link
              href={`/venues/${venue.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{venue.name}</p>
                <p className="font-mono text-xs text-muted">
                  {venue.address ?? 'address tbc'}
                  {venue.region ? ` · ${venue.region}` : ''}
                </p>
              </div>
              <span className={`font-mono text-xs ${venue.upcoming_events > 0 ? 'text-accent' : 'text-faint'}`}>
                {venue.upcoming_events > 0 ? `${venue.upcoming_events} upcoming` : 'no listings'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
