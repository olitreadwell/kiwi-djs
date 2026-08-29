import { getPool } from '@/lib/db';
import { isDbMode } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function AdminSuggestionsPage() {
  if (!isDbMode) {
    return <p className="p-8 font-mono text-sm text-muted">Suggestions require DATABASE_URL to be configured.</p>;
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
      <h1 className="text-2xl font-black text-foreground">Suggestions</h1>
      <p className="mt-1 font-mono text-xs text-muted">{rows.length} recent</p>
      <ul className="mt-6 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-edge bg-surface p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-foreground">{row.dj_name ?? 'unknown DJ'} · {row.field}</p>
              <span className={`font-mono text-[11px] ${row.status === 'pending' ? 'text-accent' : 'text-muted'}`}>{row.status}</span>
            </div>
            {row.current_value && <p className="mt-2 text-sm text-muted">was: {row.current_value}</p>}
            <p className="mt-1 text-sm text-foreground">suggested: {row.suggested_value}</p>
            {row.source_url && (
              <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 block font-mono text-xs text-accent hover:underline">
                {row.source_url}
              </a>
            )}
            {row.note && <p className="mt-1 font-mono text-xs text-muted">{row.note}</p>}
            <p className="mt-2 font-mono text-[11px] text-faint">{new Date(row.created_at).toLocaleString('en-NZ')}</p>
          </li>
        ))}
        {rows.length === 0 && <p className="font-mono text-sm text-muted">No suggestions yet.</p>}
      </ul>
    </div>
  );
}
