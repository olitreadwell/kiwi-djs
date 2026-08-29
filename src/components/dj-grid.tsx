'use client';

import { useState } from 'react';
import { DjCard } from '@/components/dj-card';
import type { DjRow } from '@/lib/queries';

const PAGE_SIZE = 12;

export function DjGrid({ djs }: { djs: DjRow[] }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = djs.slice(0, visible);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((dj) => <DjCard key={dj.id} dj={dj} />)}
      </div>
      {visible < djs.length && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setVisible((value) => value + PAGE_SIZE)}
            className="rounded-full border border-stone-700 px-5 py-2 font-mono text-xs text-stone-300 transition-colors hover:border-amber-500 hover:text-amber-300"
          >
            load more ({djs.length - visible} left)
          </button>
        </div>
      )}
    </>
  );
}
