import Link from 'next/link';
import type { DjRow } from '@/lib/queries';
import { genreAccent, genrePill, topGenres } from '@/lib/genres';

export function DjCard({ dj }: { dj: DjRow }) {
  const accent = genreAccent(dj.genres);
  return (
    <Link
      href={`/djs/${dj.id}`}
      className={`group flex flex-col justify-between rounded-lg border p-4 transition-colors ${accent}`}
    >
      <div>
        <h3 className="text-lg font-semibold text-foreground group-hover:text-accent">{dj.name}</h3>
        {topGenres(dj.genres).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {topGenres(dj.genres).map((genre) => (
              <span key={genre} className={`inline-block rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${genrePill(genre)}`}>
                {genre}
              </span>
            ))}
          </div>
        )}
        {(dj.summary || dj.bio) && (
          <p className="mt-3 line-clamp-3 text-sm text-muted">
            {dj.summary ?? dj.bio}
            {dj.summary && <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-faint">AI</span>}
          </p>
        )}
      </div>
      {dj.upcoming_events > 0 && (
        <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-muted">
          <span>{dj.upcoming_events} upcoming gig{dj.upcoming_events === 1 ? '' : 's'}</span>
        </div>
      )}
    </Link>
  );
}
