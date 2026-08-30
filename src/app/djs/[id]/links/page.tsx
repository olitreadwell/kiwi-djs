import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDjById, getDjLinks } from '@/lib/queries';
import { linkDomain, linkLabel } from '@/lib/link-labels';

export const dynamic = 'force-dynamic';

export default async function DjLinksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dj, links] = await Promise.all([getDjById(id), getDjLinks(id)]);
  if (!dj) notFound();

  const grouped = new Map<string, typeof links>();
  for (const link of links) {
    const bucket = grouped.get(link.type) ?? [];
    bucket.push(link);
    grouped.set(link.type, bucket);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href={`/djs/${dj.id}`} className="font-mono text-xs text-muted hover:text-accent">← {dj.name}</Link>
      <h1 className="mt-4 text-3xl font-black text-foreground">Links</h1>
      <p className="mt-2 font-mono text-xs text-muted">
        {links.length} public link{links.length === 1 ? '' : 's'} for {dj.name}, pulled from public sources.
      </p>

      {links.length === 0 ? (
        <p className="mt-8 font-mono text-sm text-muted">No links on file yet.</p>
      ) : (
        <div className="mt-8 space-y-8">
          {[...grouped.entries()].map(([type, typeLinks]) => (
            <section key={type}>
              <h2 className="font-mono text-xs uppercase tracking-wider text-accent">{linkLabel(type, null)}</h2>
              <ul className="mt-3 divide-y divide-edge rounded-lg border border-edge">
                {typeLinks.map((link) => (
                  <li key={link.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-foreground transition-colors hover:text-accent"
                    >
                      {link.label ?? link.url}
                    </a>
                    <span className="font-mono text-xs text-faint">{linkDomain(link.url)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
