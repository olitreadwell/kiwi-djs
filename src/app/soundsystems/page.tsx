import { getSoundsystems } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Soundsystems | Kiwi DJs' };

export default async function SoundsystemsPage() {
  const systems = await getSoundsystems();
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-black text-foreground">Soundsystems</h1>
      <p className="mt-2 font-mono text-xs text-muted">Rigs and crews — not DJs, but part of the scene</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {systems.map((system) => (
          <div key={system.id} className="rounded-lg border border-edge bg-surface p-5">
            <h2 className="text-lg font-semibold text-foreground">{system.name}</h2>
            <p className="mt-1 font-mono text-xs text-muted">
              {[system.city, system.style].filter(Boolean).join(' · ') || 'details tbc'}
            </p>
            {system.description && <p className="mt-3 text-sm text-muted">{system.description}</p>}
            {system.website && (
              <a href={system.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-mono text-xs text-accent hover:underline">
                {system.website} ↗
              </a>
            )}
          </div>
        ))}
        {systems.length === 0 && <p className="font-mono text-sm text-muted">No soundsystems listed yet.</p>}
      </div>
    </div>
  );
}
