import Link from 'next/link';

const links = [
  { href: '/', label: 'Home' },
  { href: '/djs', label: 'DJs' },
  { href: '/events', label: 'Events' },
  { href: '/discover', label: 'Discover' },
  { href: '/about', label: 'About' },
  { href: '/opt-out', label: 'Opt out' },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-mono text-sm font-bold tracking-tight text-accent">
          NZ DJs
        </Link>
        <nav className="hidden items-center gap-4 font-mono text-xs text-muted sm:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-accent">
              {link.label}
            </Link>
          ))}
        </nav>
        <details className="group relative sm:hidden">
          <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md border border-edge text-muted transition-colors hover:border-accent hover:text-accent">
            <span className="sr-only">Menu</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </summary>
          <nav className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-edge bg-surface p-2 font-mono text-sm text-muted shadow-xl">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2 hover:text-accent"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
