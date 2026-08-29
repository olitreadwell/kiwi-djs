'use client';

import { useState } from 'react';

const FIELDS = ['bio', 'genres', 'mixes', 'socials', 'photo', 'events', 'other'];

export function SuggestForm({ djId, djName }: { djId: string; djName: string }) {
  const [field, setField] = useState('other');
  const [suggestedValue, setSuggestedValue] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('sending');
    setError('');
    const res = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ djId, djName, field, suggestedValue, sourceUrl, note }),
    });
    if (res.ok) {
      setStatus('done');
      setSuggestedValue('');
      setSourceUrl('');
      setNote('');
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus('error');
      setError(data.error ?? 'Something went wrong');
    }
  }

  if (status === 'done') {
    return <p className="font-mono text-xs text-emerald-400">Thanks — suggestion received for review.</p>;
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="font-mono text-xs text-muted">
          Field
          <select
            value={field}
            onChange={(event) => setField(event.target.value)}
            className="ml-2 rounded-md border border-edge bg-surface px-2 py-1 text-foreground"
          >
            {FIELDS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        value={suggestedValue}
        onChange={(event) => setSuggestedValue(event.target.value)}
        placeholder="What should be updated?"
        required
        className="w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint"
        rows={3}
      />
      <input
        value={sourceUrl}
        onChange={(event) => setSourceUrl(event.target.value)}
        placeholder="Source URL (optional)"
        className="w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint"
      />
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional)"
        className="w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint"
      />
      {status === 'error' && <p className="font-mono text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={status === 'sending' || suggestedValue.length < 3}
        className="rounded-full border border-accent/60 px-4 py-1.5 font-mono text-xs text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      >
        {status === 'sending' ? 'Sending…' : 'Submit suggestion'}
      </button>
    </form>
  );
}
