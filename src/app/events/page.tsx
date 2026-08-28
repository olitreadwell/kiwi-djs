import Link from 'next/link';
import { getUpcomingEvents } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const events = await getUpcomingEvents(100);
  const byDate = new Map<string, typeof events>();
  for (const event of events) {
    const day = new Date(event.starts_at).toDateString();
    const bucket = byDate.get(day) ?? [];
    bucket.push(event);
    byDate.set(day, bucket);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-black text-stone-100">Event calendar</h1>
      <p className="mt-2 font-mono text-xs text-stone-500">{events.length} upcoming gigs from public listings</p>
      <div className="mt-8 space-y-10">
        {[...byDate.entries()].map(([day, dayEvents]) => (
          <section key={day}>
            <h2 className="font-mono text-sm uppercase tracking-wider text-amber-400">
              {new Date(day).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <ul className="mt-3 divide-y divide-stone-800 rounded-lg border border-stone-800">
              {dayEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="text-sm text-stone-200">{event.name}</p>
                    <p className="font-mono text-xs text-stone-500">{event.venue ?? 'TBC'}</p>
                  </div>
                  <div className="text-right">
                    {event.dj_id && (
                      <Link href={`/djs/${event.dj_id}`} className="font-mono text-xs text-amber-400 hover:underline">
                        {event.dj_name}
                      </Link>
                    )}
                    {event.url && (
                      <a href={event.url} target="_blank" rel="noopener noreferrer" className="mt-1 block font-mono text-xs text-stone-500 hover:text-amber-400">
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
