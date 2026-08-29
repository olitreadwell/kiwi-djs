import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-stone-800 py-8 text-center font-mono text-xs text-stone-500">
      <p>NZ DJs · public data only · respect the artists</p>
      <p className="mt-2">
        <Link href="/opt-out" className="underline hover:text-amber-400">Remove yourself</Link>
        {' · '}
        <Link href="/health" className="underline hover:text-amber-400">health</Link>
      </p>
    </footer>
  );
}
