'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Mobile nav: closes when you tap outside, press Escape, or navigate.
export function MobileMenu({ links }: { links: Array<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label="Menu"
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-edge text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <nav
          id="mobile-nav"
          className="absolute right-0 top-full mt-2 max-h-[80vh] w-48 overflow-y-auto rounded-lg border border-edge bg-surface p-2 font-mono text-sm text-muted shadow-xl"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2 hover:text-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
