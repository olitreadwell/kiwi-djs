'use client';

import { useState } from 'react';
import type { MixRow } from '@/lib/queries';

const PAGE_SIZE = 20;

export function MixList({ mixes }: { mixes: MixRow[] }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = mixes.slice(0, visible);
  return (
    <>
      <ul className="mt-4 divide-y divide-stone-800 rounded-lg border border-stone-800">
        {shown.map((mix) => (
          <li key={mix.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <p className="text-sm text-stone-200">{mix.title}</p>
            <a href={mix.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-amber-400 hover:underline">
              {mix.platform} ↗
            </a>
          </li>
        ))}
      </ul>
      {visible < mixes.length && (
        <button
          onClick={() => setVisible((value) => value + PAGE_SIZE)}
          className="mt-3 rounded-full border border-stone-700 px-4 py-1.5 font-mono text-xs text-stone-300 transition-colors hover:border-amber-500 hover:text-amber-300"
        >
          show more ({mixes.length - visible} left)
        </button>
      )}
    </>
  );
}
