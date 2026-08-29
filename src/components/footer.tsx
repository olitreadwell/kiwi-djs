import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-edge py-8 text-center font-mono text-xs text-muted">
      <p>NZ DJs · public data only · respect the artists</p>
      <p className="mt-2">
        <Link href="/opt-out" className="underline hover:text-accent">Remove yourself</Link>
        {' · '}
        <Link href="/health" className="underline hover:text-accent">health</Link>
      </p>
    </footer>
  );
}
