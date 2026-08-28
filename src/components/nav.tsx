import Link from 'next/link';

const links = [
  { href: '/', label: 'Home' },
  { href: '/djs', label: 'DJs' },
  { href: '/events', label: 'Events' },
  { href: '/discover', label: 'Discover' },
  { href: '/opt-out', label: 'Opt out' },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-800 bg-stone-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-mono text-sm font-bold tracking-tight text-amber-400">
          WGN DJs
        </Link>
        <nav className="flex items-center gap-4 font-mono text-xs text-stone-400">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-amber-400">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
