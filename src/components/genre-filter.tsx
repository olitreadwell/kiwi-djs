'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function GenreFilter({ genres }: { genres: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get('genre') ?? '';

  function setGenre(genre: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (genre && genre !== active) params.set('genre', genre);
    else params.delete('genre');
    router.push(`/djs?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setGenre('')}
        className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${
          active === '' ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-stone-700 text-stone-400 hover:border-amber-500/50'
        }`}
      >
        all
      </button>
      {genres.map((genre) => (
        <button
          key={genre}
          onClick={() => setGenre(genre)}
          className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${
            active === genre ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-stone-700 text-stone-400 hover:border-amber-500/50'
          }`}
        >
          {genre}
        </button>
      ))}
    </div>
  );
}
