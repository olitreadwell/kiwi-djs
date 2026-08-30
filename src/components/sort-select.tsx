'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const SORTS = [
  { value: 'completeness', label: 'most info' },
  { value: 'name', label: 'name A-Z' },
  { value: 'recent', label: 'recently added' },
  { value: 'updated', label: 'recently updated' },
  { value: 'gigs', label: 'most gigs' },
];

export function SortSelect({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setSort(sort: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (sort && sort !== 'completeness') params.set('sort', sort);
    else params.delete('sort');
    router.push(`/djs?${params.toString()}`);
  }

  return (
    <label className="font-mono text-xs text-muted">
      sort
      <select
        value={current}
        onChange={(event) => setSort(event.target.value)}
        className="ml-2 rounded-md border border-edge bg-surface px-2 py-1.5 text-foreground"
      >
        {SORTS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
