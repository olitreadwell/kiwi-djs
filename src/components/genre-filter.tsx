'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { genrePill } from '@/lib/genres';

export function GenreFilter({ genres }: { genres: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get('genre') ?? '';
  const [open, setOpen] = useState(false);

  function setGenre(genre: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (genre && genre !== active) params.set('genre', genre);
    else params.delete('genre');
    router.push(`/djs?${params.toString()}`);
  }

  return (
    <div>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-edge px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
      >
        Filters
        {active !== '' && (
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-accent">{active}</span>
        )}
        <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setGenre('')}
            className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${
              active === '' ? 'border-accent bg-accent/10 text-accent' : 'border-edge text-muted hover:border-accent/50'
            }`}
          >
            all
          </button>
          {genres.map((genre) => (
            <button
              key={genre}
              onClick={() => setGenre(genre)}
              className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${
                active === genre ? `border-transparent ${genrePill([genre])}` : 'border-edge text-muted hover:border-accent/50'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
