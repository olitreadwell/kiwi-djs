import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProfileViewTracker } from '@/components/profile-view-tracker';
import { getDjById, getDjGigs } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function DjProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dj, gigs] = await Promise.all([getDjById(id), getDjGigs(id)]);
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
        <div>
          <h1 className="text-4xl font-black text-stone-100">{dj.name}</h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-wider text-amber-400">{dj.genres.join(' / ')}</p>
          {dj.bio && <p className="mt-4 max-w-2xl text-stone-300">{dj.bio}</p>}
        </div>
        <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4 font-mono text-xs text-stone-400">
          <p>{dj.popularity} profile plays</p>
          <p>{dj.data_completeness}% data complete</p>
          <p className="mt-1 text-stone-600">source: {dj.source}</p>
        </div>
      </div>

      {socials.length > 0 && (
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
        </div>
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
    </div>
  );
}
