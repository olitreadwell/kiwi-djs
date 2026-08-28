import Link from 'next/link';
import type { DjRow } from '@/lib/queries';

export function DjCard({ dj }: { dj: DjRow }) {
  return (
    <Link
      href={`/djs/${dj.id}`}
      className="group flex flex-col justify-between rounded-lg border border-stone-800 bg-stone-900/60 p-4 transition-colors hover:border-amber-500/60"
    >
      <div>
        <h3 className="text-lg font-semibold text-stone-100 group-hover:text-amber-300">{dj.name}</h3>
        {dj.genres.length > 0 && (
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-stone-500">
            {dj.genres.join(' / ')}
          </p>
        )}
        {dj.bio && <p className="mt-3 line-clamp-3 text-sm text-stone-400">{dj.bio}</p>}
      </div>
      <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-stone-500">
        <span>{dj.upcoming_events > 0 ? `${dj.upcoming_events} upcoming gig${dj.upcoming_events === 1 ? '' : 's'}` : 'no listed gigs'}</span>
        <span className="text-amber-500/80">{dj.popularity} plays</span>
      </div>
    </Link>
  );
}
