'use client';

import { useState } from 'react';

export function OptOutForm() {
  const [djId, setDjId] = useState('');
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle');

  async function submit() {
    if (!djId.trim()) return;
    const res = await fetch('/api/opt-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ djId: djId.trim().toLowerCase() }),
    });
    setStatus(res.ok ? 'done' : 'error');
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <label className="block font-mono text-xs text-stone-400" htmlFor="djId">
        DJ page id (the part after /djs/, e.g. <span className="text-amber-400">dick-johnson</span>)
      </label>
      <input
        id="djId"
        value={djId}
        onChange={(e) => setDjId(e.target.value)}
        className="w-full rounded-lg border border-stone-700 bg-stone-900 px-4 py-3 font-mono text-sm text-stone-100 focus:border-amber-500 focus:outline-none"
        placeholder="dick-johnson"
      />
      <button
        onClick={submit}
        className="w-full rounded-lg border border-amber-500 bg-amber-500/10 px-4 py-3 font-mono text-sm text-amber-300 transition-colors hover:bg-amber-500/20"
      >
        Remove my profile
      </button>
      {status === 'done' && <p className="font-mono text-xs text-emerald-400">Done. Your profile is hidden from the directory.</p>}
      {status === 'error' && <p className="font-mono text-xs text-red-400">Could not process that id. Check it and try again.</p>}
    </div>
  );
}
