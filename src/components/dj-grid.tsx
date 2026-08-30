'use client';

import { useState } from 'react';
import { DjCard } from '@/components/dj-card';
import type { DjRow } from '@/lib/queries';

const PAGE_SIZE = 36;

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
            className="rounded-full border border-edge px-5 py-2 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
          >
            load more ({djs.length - visible} left)
          </button>
        </div>
      )}
    </>
  );
}
