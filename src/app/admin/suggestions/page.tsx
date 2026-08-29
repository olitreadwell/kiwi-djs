import { getPool } from '@/lib/db';
import { isDbMode } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function AdminSuggestionsPage() {
  if (!isDbMode) {
    return <p className="p-8 font-mono text-sm text-stone-500">Suggestions require DATABASE_URL to be configured.</p>;
  }
  const pool = getPool();
  const rows = (
    await pool.query(
      `SELECT id, dj_name, field, current_value, suggested_value, source_url, note, status, created_at
       FROM suggestions ORDER BY created_at DESC LIMIT 100`,
    )
  ).rows;
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-black text-stone-100">Suggestions</h1>
      <p className="mt-1 font-mono text-xs text-stone-500">{rows.length} recent</p>
      <ul className="mt-6 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-stone-200">{row.dj_name ?? 'unknown DJ'} · {row.field}</p>
              <span className={`font-mono text-[11px] ${row.status === 'pending' ? 'text-amber-400' : 'text-stone-500'}`}>{row.status}</span>
            </div>
            {row.current_value && <p className="mt-2 text-sm text-stone-500">was: {row.current_value}</p>}
            <p className="mt-1 text-sm text-stone-200">suggested: {row.suggested_value}</p>
            {row.source_url && (
              <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 block font-mono text-xs text-amber-400 hover:underline">
                {row.source_url}
              </a>
            )}
            {row.note && <p className="mt-1 font-mono text-xs text-stone-500">{row.note}</p>}
            <p className="mt-2 font-mono text-[11px] text-stone-600">{new Date(row.created_at).toLocaleString('en-NZ')}</p>
          </li>
        ))}
        {rows.length === 0 && <p className="font-mono text-sm text-stone-500">No suggestions yet.</p>}
      </ul>
    </div>
  );
}
