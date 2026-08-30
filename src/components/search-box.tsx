'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialValue = useRef(value);

  useEffect(() => {
    // Only navigate when the user actually changed the query — the effect
    // also runs on mount, and pushing to /djs then would redirect any page
    // that embeds the search box (e.g. the homepage) away from itself.
    if (value === initialValue.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void fetch('/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: value.trim() }),
      }).catch(() => undefined);
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set('q', value.trim());
      else params.delete('q');
      router.push(`/djs?${params.toString()}`, { scroll: false });
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, router, searchParams]);

  return (
    <input
      type="search"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Search DJs, genres, sounds…"
      className="w-full rounded-lg border border-edge bg-surface px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      aria-label="Search DJs"
    />
  );
}
