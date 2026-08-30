import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDjById, getDjLinks, pickBestLinks } from '@/lib/queries';
import { displayLabel, linkDomain } from '@/lib/link-labels';
import { LinkFeedback } from '@/components/link-feedback';

export const dynamic = 'force-dynamic';

export default async function DjLinksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dj, links] = await Promise.all([getDjById(id), getDjLinks(id)]);
  if (!dj) notFound();

  const bestLinks = pickBestLinks(dj, links);
  const bestById = new Set(bestLinks.map((link) => link.id));
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
        {links.length} public link{links.length === 1 ? '' : 's'} for {dj.name}. The flagged one is the best guess — vote on which is right.
      </p>

      {links.length === 0 ? (
        <p className="mt-8 font-mono text-sm text-muted">No links on file yet.</p>
      ) : (
        <div className="mt-8 space-y-8">
          {[...grouped.entries()].map(([type, typeLinks]) => (
            <section key={type}>
              <h2 className="font-mono text-xs uppercase tracking-wider text-accent">{displayLabel(type, null)}</h2>
              <ul className="mt-3 divide-y divide-edge rounded-lg border border-edge">
                {typeLinks.map((link) => (
                  <li
                    key={link.id}
                    className={`flex items-center justify-between gap-4 px-4 py-3 ${bestById.has(link.id) ? 'border-l-2 border-l-accent bg-accent/5' : ''}`}
                  >
                    <div className="min-w-0">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-foreground transition-colors hover:text-accent"
                      >
                        {displayLabel(link.type, link.label)}
                      </a>
                      <span className="font-mono text-xs text-faint"> · {linkDomain(link.url)}</span>
                      {bestById.has(link.id) && <span className="ml-2 font-mono text-xs text-accent">best guess</span>}
                    </div>
                    <LinkFeedback linkId={link.id} helpful={link.helpful} unhelpful={link.unhelpful} />
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
