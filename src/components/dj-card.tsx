import Link from 'next/link';
import type { DjRow } from '@/lib/queries';
import { genreAccent, topGenres } from '@/lib/genres';

export function DjCard({ dj }: { dj: DjRow }) {
  const accent = genreAccent(dj.genres);
  return (
    <Link
      href={`/djs/${dj.id}`}
      className={`group flex flex-col justify-between rounded-lg border bg-surface p-4 transition-colors ${accent}`}
    >
      <div>
        <h3 className="text-lg font-semibold text-foreground group-hover:text-accent">{dj.name}</h3>
        {dj.genres.length > 0 && (
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted">
            {topGenres(dj.genres).join(' / ')}
          </p>
        )}
        {dj.bio && <p className="mt-3 line-clamp-3 text-sm text-muted">{dj.bio}</p>}
      </div>
      <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-muted">
        <span>{dj.upcoming_events > 0 ? `${dj.upcoming_events} upcoming gig${dj.upcoming_events === 1 ? '' : 's'}` : 'no listed gigs'}</span>
      </div>
    </Link>
  );
}
