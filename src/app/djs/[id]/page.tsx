import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ProfileViewTracker } from '@/components/profile-view-tracker';
import { MixList } from '@/components/mix-list';
import { MixEmbed } from '@/components/mix-embed';
import { SuggestForm } from '@/components/suggest-form';
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

const TYPE_LABELS: Record<string, string> = {
  soundcloud: 'SoundCloud',
  mixcloud: 'Mixcloud',
  instagram: 'Instagram',
  facebook: 'Facebook',
  website: 'Website',
  spotify: 'Spotify',
  bandcamp: 'Bandcamp',
  'resident-advisor': 'Resident Advisor',
  twitter: 'Twitter / X',
  youtube: 'YouTube',
  discogs: 'Discogs',
  tiktok: 'TikTok',
  mastodon: 'Mastodon',
  threads: 'Threads',
  radio: 'Radio',
  festival: 'Festival',
  news: 'News',
  'other databases': 'Other databases',
  'free streaming': 'Free streaming',
  'purchase for download': 'Download',
  streaming: 'Streaming',
  'social network': 'Social',
  wikidata: 'Wikidata',
  allmusic: 'AllMusic',
  myspace: 'MySpace',
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <ProfileViewTracker djId={dj.id} />
      <Link href="/djs" className="font-mono text-xs text-stone-500 hover:text-amber-400">← all DJs</Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
        {dj.image_url && (
          <Image
            src={dj.image_url}
            alt={`${dj.name} photo`}
            width={96}
            height={96}
            unoptimized
            className="h-24 w-24 rounded-full border border-stone-800 object-cover"
          />
        )}
        <div>
          <h1 className="text-4xl font-black text-stone-100">{dj.name}</h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-wider text-amber-400">{dj.genres.join(' / ') || 'genre tbc'}</p>
          {dj.bpm_range && <p className="mt-1 font-mono text-xs text-stone-500">{dj.bpm_range} BPM</p>}
        </div>
        <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4 font-mono text-xs text-stone-400">
          <p>{dj.popularity} profile plays</p>
          <p>{dj.data_completeness}% data complete</p>
          <p className="mt-1 text-stone-300">
            {dj.last_played_at
              ? `last played ${new Date(dj.last_played_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : 'last played: unknown'}
          </p>
          <p className="mt-1 text-emerald-400">
            {dj.verification_level >= 2
              ? `verified · ${dj.verification_sources.join(' + ')}`
              : dj.verification_level === 1
                ? 'listed · needs more sources'
                : 'candidate · unverified'}
          </p>
          <p className="mt-1 text-stone-600">source: {dj.source}</p>
        </div>
      </div>

      {summary && (
        <section className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="font-mono text-xs uppercase tracking-wider text-amber-400">The lowdown</h2>
          <p className="mt-2 leading-relaxed text-stone-200">{summary}</p>
        </section>
      )}

      {dj.bio && <p className="mt-6 text-stone-300">{dj.bio}</p>}

      {(socials.length > 0 || links.length > 0) && (
        <div className="mt-8 flex flex-wrap gap-2">
          {socials.map((social) => (
            <a
              key={social.label}
              href={social.href!}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-stone-700 px-3 py-1 font-mono text-xs text-stone-300 transition-colors hover:border-amber-500 hover:text-amber-300"
            >
              {social.label} ↗
            </a>
          ))}
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-stone-700 px-3 py-1 font-mono text-xs text-stone-300 transition-colors hover:border-amber-500 hover:text-amber-300"
            >
              {link.label ?? TYPE_LABELS[link.type] ?? link.type} ↗
            </a>
          ))}
        </div>
      )}

      {mixes.filter((mix) => mix.kind === 'mix').length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-stone-100">Mixes</h2>
          <MixEmbed mixes={mixes.filter((mix) => mix.kind === 'mix')} />
          <MixList mixes={mixes.filter((mix) => mix.kind === 'mix')} />
        </section>
      )}

      {mixes.filter((mix) => mix.kind === 'interview').length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-stone-100">Interviews</h2>
          <MixList mixes={mixes.filter((mix) => mix.kind === 'interview')} />
        </section>
      )}

      {articles.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-stone-100">In the news</h2>
          <ul className="mt-4 divide-y divide-stone-800 rounded-lg border border-stone-800">
            {articles.map((article) => (
              <li key={article.id} className="px-4 py-3">
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-sm text-stone-200 hover:text-amber-300">
                  {article.title}
                </a>
                <p className="mt-1 font-mono text-xs text-stone-500">
                  {article.source ?? 'press'}
                  {article.published_at ? ` · ${new Date(article.published_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </p>
                {article.snippet && <p className="mt-1 text-xs text-stone-500">{article.snippet}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {collabs.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-stone-100">Played with</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {collabs.map((collab) => (
              collab.dj_id ? (
                <Link key={collab.name} href={`/djs/${collab.dj_id}`} className="rounded-full border border-stone-700 px-3 py-1 font-mono text-xs text-stone-300 hover:border-amber-500 hover:text-amber-300">
                  {collab.name} ×{collab.count}
                </Link>
              ) : (
                <span key={collab.name} className="rounded-full border border-stone-800 px-3 py-1 font-mono text-xs text-stone-500">
                  {collab.name} ×{collab.count}
                </span>
              )
            ))}
          </div>
        </section>
      )}

      {labels.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-stone-100">Labels & promoters</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {labels.map((label) => (
              <span key={label.name} className="rounded-full border border-stone-800 px-3 py-1 font-mono text-xs text-stone-400">
                {label.name} ×{label.count}
              </span>
            ))}
          </div>
        </section>
      )}

      <h2 className="mt-12 text-xl font-bold text-stone-100">Upcoming gigs</h2>
      {gigs.length === 0 ? (
        <p className="mt-3 font-mono text-sm text-stone-500">No upcoming gigs listed yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-800 rounded-lg border border-stone-800">
          {gigs.map((gig) => (
            <li key={gig.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm text-stone-200">{gig.name}</p>
                <p className="font-mono text-xs text-stone-500">{gig.venue ?? 'TBC'}</p>
              </div>
              <div className="text-right font-mono text-xs text-stone-400">
                {new Date(gig.starts_at).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                {gig.url && (
                  <a href={gig.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-amber-400 hover:underline">tickets ↗</a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pastGigs.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-stone-100">Past gigs</h2>
          <ul className="mt-4 divide-y divide-stone-800 rounded-lg border border-stone-800">
            {pastGigs.map((gig) => (
              <li key={gig.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm text-stone-200">{gig.name}</p>
                  <p className="font-mono text-xs text-stone-500">{gig.venue ?? 'TBC'}</p>
                </div>
                <p className="font-mono text-xs text-stone-500">
                  {new Date(gig.starts_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-stone-100">Similar DJs</h2>
          <p className="mt-1 font-mono text-xs text-stone-500">Same genres, same rooms.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((other) => (
              <Link key={other.id} href={`/djs/${other.id}`} className="rounded-lg border border-stone-800 bg-stone-900/60 p-4 transition-colors hover:border-amber-500/60">
                <p className="text-sm font-semibold text-stone-200">{other.name}</p>
                <p className="mt-1 font-mono text-xs text-stone-500">
                  {other.genres.slice(0, 3).join(' / ') || 'genre tbc'}
                  {other.shared_events > 0 ? ` · ${other.shared_events} shared night${other.shared_events === 1 ? '' : 's'}` : ''}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <details className="mt-12 rounded-lg border border-stone-800">
        <summary className="cursor-pointer px-4 py-3 font-mono text-xs uppercase tracking-wider text-stone-400 transition-colors hover:text-amber-300">
          Sources
        </summary>
        <div className="border-t border-stone-800 px-4 py-3 font-mono text-xs text-stone-500">
          <p className="text-stone-400">Verification evidence: {dj.verification_sources.join(', ') || 'none'}</p>
          <p className="mt-1">Source: {dj.source}</p>
          {links.length > 0 && (
            <ul className="mt-2 space-y-1">
              {links.map((link) => (
                <li key={link.id}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-stone-400 hover:text-amber-300">
                    {TYPE_LABELS[link.type] ?? link.type}: {link.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details className="mt-4 rounded-lg border border-stone-800">
        <summary className="cursor-pointer px-4 py-3 font-mono text-xs uppercase tracking-wider text-stone-400 transition-colors hover:text-amber-300">
          Suggest an update
        </summary>
        <div className="border-t border-stone-800 px-4 py-3">
          <p className="font-mono text-xs text-stone-500">Spot a mistake or something new? Tell us — reviewed before publish.</p>
          <SuggestForm djId={dj.id} djName={dj.name} />
        </div>
      </details>
    </div>
  );
}
