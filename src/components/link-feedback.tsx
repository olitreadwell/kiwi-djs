'use client';

import { useState } from 'react';

// Thumbs up/down on a link: helps pick the right profile when a DJ has
// several candidates for the same platform (#74).
export function LinkFeedback({ linkId, helpful, unhelpful }: { linkId: string; helpful: number; unhelpful: number }) {
  const [votes, setVotes] = useState({ helpful, unhelpful });
  const [saving, setSaving] = useState(false);

  async function vote(isHelpful: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/link-feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ linkId, helpful: isHelpful }),
      });
      if (res.ok) {
        const data = (await res.json()) as { helpful: number; unhelpful: number };
        setVotes(data);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1 font-mono text-xs text-muted">
      <button
        type="button"
        onClick={() => void vote(true)}
        aria-label="This is the right link"
        className="rounded-md border border-edge px-2 py-1 transition-colors hover:border-emerald-400 hover:text-emerald-400"
      >
        ✓ {votes.helpful}
      </button>
      <button
        type="button"
        onClick={() => void vote(false)}
        aria-label="This is the wrong link"
        className="rounded-md border border-edge px-2 py-1 transition-colors hover:border-red-400 hover:text-red-400"
      >
        ✗ {votes.unhelpful}
      </button>
    </div>
  );
}
