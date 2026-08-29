'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function RegionFilter({ regions }: { regions: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get('region') ?? '';

  function setRegion(region: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (region) params.set('region', region);
    else params.delete('region');
    router.push(`/events?${params.toString()}`);
  }

  return (
    <label className="font-mono text-xs text-stone-400">
      region
      <select
        value={active}
        onChange={(event) => setRegion(event.target.value)}
        className="ml-2 rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-stone-200"
      >
        <option value="">all</option>
        {regions.map((region) => (
          <option key={region} value={region}>{region}</option>
        ))}
      </select>
    </label>
  );
}
