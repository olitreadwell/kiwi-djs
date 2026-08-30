import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ProfileViewTracker } from '@/components/profile-view-tracker';
import { MixList } from '@/components/mix-list';
import { MixEmbed } from '@/components/mix-embed';
import { SuggestForm } from '@/components/suggest-form';
import { topGenres } from '@/lib/genres';
import { linkLabel, pillLabel } from '@/lib/link-labels';
import { pickBestLinks } from '@/lib/queries';
import {
  buildDossier,
  getDjArticles,
  getDjById,
  getDjCollabs,
  getDjGigs,
  getDjLabels,
  getDjLinks,
  getDjMixes,
  getDjPastGigs,
  getSimilarDjs,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

const EVIDENCE_LABELS: Record<string, string> = {
  mixes: 'Mixes',
  links: 'Links',
  articles: 'News coverage',
  gigs: 'Gigs',
};

export default async function DjProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dj, gigs, pastGigs, mixes, articles, links, collabs, labels, similar, summary] = await Promise.all([
    getDjById(id),
    getDjGigs(id),
    getDjPastGigs(id),
    getDjMixes(id),
    getDjArticles(id),
    getDjLinks(id),
    getDjCollabs(id),
    getDjLabels(id),
    getSimilarDjs(id),
    buildDossier(id),
  ]);
  if (!dj) notFound();

  const socials = [
    { label: 'SoundCloud', href: dj.soundcloud_url },
    { label: 'Instagram', href: dj.instagram_url },
    { label: 'Facebook', href: dj.facebook_url },
    { label: 'Mixcloud', href: dj.mixcloud_url },
    { label: 'Website', href: dj.website_url },
  ].filter((s) => s.href);
  const bestLinks = pickBestLinks(dj, links);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <ProfileViewTracker djId={dj.id} />
      <Link href="/djs" className="font-mono text-xs text-muted hover:text-accent">← all DJs</Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
        {dj.image_url && (
          <Image
            src={dj.image_url}
            alt={`${dj.name} photo`}
            width={96}
            height={96}
            unoptimized
            className="h-24 w-24 rounded-full border border-edge object-cover"
          />
        )}
        <div>
          <h1 className="text-4xl font-black text-foreground">{dj.name}</h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-wider text-accent">{topGenres(dj.genres).join(' / ') || 'genre tbc'}</p>
          {dj.bpm_range && <p className="mt-1 font-mono text-xs text-muted">{dj.bpm_range} BPM</p>}
        </div>
        <div className="rounded-lg border border-edge bg-surface p-4 font-mono text-xs text-muted">
          <p>{dj.data_completeness}% data complete</p>
          <p className="mt-1 text-muted">
            {dj.last_played_at
              ? `last played ${new Date(dj.last_played_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : 'last played: unknown'}
          </p>
          <p className="mt-1">
            <span
              className={
                dj.verification_level >= 2
                  ? 'text-emerald-400'
                  : dj.verification_level === 1
                    ? 'text-amber-400'
                    : 'text-faint'
              }
            >
              {dj.verification_level >= 2 ? '✓ verified' : dj.verification_level === 1 ? 'listed' : 'candidate'}
            </span>
            {dj.verification_sources.length > 0 && (
              <details className="mt-1 inline-block align-middle">
                <summary className="ml-2 inline-block cursor-pointer font-mono text-xs text-faint transition-colors hover:text-accent">
                  evidence
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {dj.verification_sources.map((source) => (
                    <li key={source} className="text-faint">
                      {EVIDENCE_LABELS[source] ?? source}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </p>
          <p className="mt-1 text-faint">source: {dj.source}</p>
          {dj.profile_location && <p className="mt-1 text-faint">profile: {dj.profile_location}</p>}
        </div>
      </div>

      {summary && (
        <section className="mt-8 rounded-lg border border-accent/30 bg-accent/5 p-5">
          <h2 className="font-mono text-xs uppercase tracking-wider text-accent">The lowdown</h2>
          <p className="mt-2 leading-relaxed text-foreground">{summary}</p>
        </section>
      )}

      {dj.bio && <p className="mt-6 text-muted">{dj.bio}</p>}

      {(socials.length > 0 || bestLinks.length > 0) && (
        <div className="mt-8 flex flex-wrap gap-2">
          {socials.map((social) => (
            <a
              key={social.label}
              href={social.href!}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-edge px-3 py-1 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {social.label} ↗
            </a>
          ))}
          {bestLinks.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-edge px-3 py-1 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {pillLabel(link.type)} ↗
            </a>
          ))}
          {links.length > 0 && (
            <Link
              href={`/djs/${dj.id}/links`}
              className="rounded-full border border-accent px-3 py-1 font-mono text-xs text-accent transition-colors hover:bg-accent hover:text-background"
            >
              all links →
            </Link>
          )}
        </div>
      )}

      {mixes.filter((mix) => mix.kind === 'mix').length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground">Mixes</h2>
          <MixEmbed mixes={mixes.filter((mix) => mix.kind === 'mix')} />
          <MixList mixes={mixes.filter((mix) => mix.kind === 'mix')} />
        </section>
      )}

      {mixes.filter((mix) => mix.kind === 'interview').length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground">Interviews</h2>
          <MixList mixes={mixes.filter((mix) => mix.kind === 'interview')} />
        </section>
      )}

      {articles.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground">In the news</h2>
          <ul className="mt-4 divide-y divide-edge rounded-lg border border-edge">
            {articles.map((article) => (
              <li key={article.id} className="px-4 py-3">
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground hover:text-accent">
                  {article.title}
                </a>
                <p className="mt-1 font-mono text-xs text-muted">
                  {article.source ?? 'press'}
                  {article.published_at ? ` · ${new Date(article.published_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </p>
                {article.snippet && <p className="mt-1 text-xs text-muted">{article.snippet}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {collabs.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground">Played with</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {collabs.map((collab) => (
              collab.dj_id ? (
                <Link key={collab.name} href={`/djs/${collab.dj_id}`} className="rounded-full border border-edge px-3 py-1 font-mono text-xs text-muted hover:border-accent hover:text-accent">
                  {collab.name} ×{collab.count}
                </Link>
              ) : (
                <span key={collab.name} className="rounded-full border border-edge px-3 py-1 font-mono text-xs text-muted">
                  {collab.name} ×{collab.count}
                </span>
              )
            ))}
          </div>
        </section>
      )}

      {labels.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground">Labels & promoters</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {labels.map((label) => (
              <span key={label.name} className="rounded-full border border-edge px-3 py-1 font-mono text-xs text-muted">
                {label.name} ×{label.count}
              </span>
            ))}
          </div>
        </section>
      )}

      <h2 className="mt-12 text-xl font-bold text-foreground">Upcoming gigs</h2>
      {gigs.length === 0 ? (
        <p className="mt-3 font-mono text-sm text-muted">No upcoming gigs listed yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-edge rounded-lg border border-edge">
          {gigs.map((gig) => (
            <li key={gig.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm text-foreground">{gig.name}</p>
                <p className="font-mono text-xs text-muted">{gig.venue ?? 'TBC'}</p>
              </div>
              <div className="text-right font-mono text-xs text-muted">
                {new Date(gig.starts_at).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                {gig.url && (
                  <a href={gig.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-accent hover:underline">tickets ↗</a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pastGigs.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground">Past gigs</h2>
          <ul className="mt-4 divide-y divide-edge rounded-lg border border-edge">
            {pastGigs.map((gig) => (
              <li key={gig.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm text-foreground">{gig.name}</p>
                  <p className="font-mono text-xs text-muted">{gig.venue ?? 'TBC'}</p>
                </div>
                <p className="font-mono text-xs text-muted">
                  {new Date(gig.starts_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground">Similar DJs</h2>
          <p className="mt-1 font-mono text-xs text-muted">Same genres, same rooms.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((other) => (
              <Link key={other.id} href={`/djs/${other.id}`} className="rounded-lg border border-edge bg-surface p-4 transition-colors hover:border-accent/60">
                <p className="text-sm font-semibold text-foreground">{other.name}</p>
                <p className="mt-1 font-mono text-xs text-muted">
                  {other.genres.slice(0, 3).join(' / ') || 'genre tbc'}
                  {other.shared_events > 0 ? ` · ${other.shared_events} shared night${other.shared_events === 1 ? '' : 's'}` : ''}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <details className="mt-12 rounded-lg border border-edge">
        <summary className="cursor-pointer px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:text-accent">
          Sources
        </summary>
        <div className="border-t border-edge px-4 py-3 font-mono text-xs text-muted">
          <p className="text-muted">Verification evidence: {dj.verification_sources.join(', ') || 'none'}</p>
          <p className="mt-1">Source: {dj.source}</p>
          {links.length > 0 && (
            <ul className="mt-2 space-y-1">
              {links.map((link) => (
                <li key={link.id}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent">
                    {linkLabel(link.type, link.label)}: {link.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details className="mt-4 rounded-lg border border-edge">
        <summary className="cursor-pointer px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:text-accent">
          Suggest an update
        </summary>
        <div className="border-t border-edge px-4 py-3">
          <p className="font-mono text-xs text-muted">Spot a mistake or something new? Tell us — reviewed before publish.</p>
          <SuggestForm djId={dj.id} djName={dj.name} />
        </div>
      </details>
    </div>
  );
}
