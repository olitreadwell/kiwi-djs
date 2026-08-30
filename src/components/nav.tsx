import Link from 'next/link';
import { MobileMenu } from './mobile-menu';

const links = [
  { href: '/', label: 'Home' },
  { href: '/djs', label: 'DJs' },
  { href: '/events', label: 'Events' },
  { href: '/venues', label: 'Venues' },
  { href: '/discover', label: 'Discover' },
  { href: '/orgs', label: 'Orgs' },
  { href: '/soundsystems', label: 'Soundsystems' },
  { href: '/about', label: 'About' },
  { href: '/opt-out', label: 'Opt out' },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-mono text-sm font-bold tracking-tight text-accent">
          Aotearoa DJs
        </Link>
        <nav className="hidden items-center gap-4 font-mono text-xs text-muted sm:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-accent">
              {link.label}
            </Link>
          ))}
        </nav>
        <MobileMenu links={links} />
      </div>
    </header>
  );
}
