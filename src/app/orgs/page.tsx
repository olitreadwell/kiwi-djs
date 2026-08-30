import { getOrgs } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Orgs | Kiwi DJs' };

export default async function OrgsPage() {
  const orgs = await getOrgs();
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-black text-foreground">Orgs & collectives</h1>
      <p className="mt-2 font-mono text-xs text-muted">Event orgs, collectives and promoters across Aotearoa</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {orgs.map((org) => (
          <div key={org.id} className="rounded-lg border border-edge bg-surface p-5">
            <h2 className="text-lg font-semibold text-foreground">{org.name}</h2>
            {org.city && <p className="mt-1 font-mono text-xs text-muted">{org.city}</p>}
            {org.description && <p className="mt-3 text-sm text-muted">{org.description}</p>}
            {org.website && (
              <a href={org.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-mono text-xs text-accent hover:underline">
                {org.website} ↗
              </a>
            )}
          </div>
        ))}
        {orgs.length === 0 && <p className="font-mono text-sm text-muted">No orgs listed yet.</p>}
      </div>
    </div>
  );
}
