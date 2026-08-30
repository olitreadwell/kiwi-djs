'use client';

import { useSyncExternalStore, useState } from 'react';

const STORAGE_PREFIX = 'nz-vote-';

function readStoredVote(linkId: string): boolean | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + linkId);
    if (stored === 'true' || stored === 'false') return stored === 'true';
  } catch {
    // private mode — voting still works for the session
  }
  return null;
}

function subscribe(): () => void {
  return () => undefined;
}

// Thumbs up/down on a link: helps pick the right profile when a DJ has
// several candidates for the same platform (#74). Votes save to the
// database when DATABASE_URL is configured; on the snapshot-mode deploy
// (no DB) they persist in localStorage so the visitor's vote still
// registers on their device instead of silently doing nothing.
export function LinkFeedback({ linkId, helpful, unhelpful }: { linkId: string; helpful: number; unhelpful: number }) {
  const [votes, setVotes] = useState({ helpful, unhelpful });
  const localVote = useSyncExternalStore(subscribe, () => readStoredVote(linkId), () => null);
  const [saving, setSaving] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);

  async function vote(isHelpful: boolean) {
    if (saving) return;
    setSaving(true);
    const previous = localVote;
    setSavedLocally(false);
    setVotes((current) => {
      const next = { ...current };
      if (previous === true) next.helpful -= 1;
      if (previous === false) next.unhelpful -= 1;
      if (isHelpful) next.helpful += 1;
      else next.unhelpful += 1;
      return next;
    });
    try {
      window.localStorage.setItem(STORAGE_PREFIX + linkId, String(isHelpful));
    } catch {
      // ignore — session-only vote
    }
    try {
      const res = await fetch('/api/v1/link-feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ linkId, helpful: isHelpful }),
      });
      if (res.ok) {
        const data = (await res.json()) as { helpful: number; unhelpful: number };
        setVotes(data);
        setSavedLocally(false);
      } else {
        setSavedLocally(true);
      }
    } catch {
      setSavedLocally(true);
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
        aria-pressed={localVote === true}
        className={`rounded-md border px-2 py-1 transition-colors hover:border-emerald-400 hover:text-emerald-400 ${localVote === true ? 'border-emerald-400 text-emerald-400' : 'border-edge'}`}
      >
        ✓ {votes.helpful}
      </button>
      <button
        type="button"
        onClick={() => void vote(false)}
        aria-label="This is the wrong link"
        aria-pressed={localVote === false}
        className={`rounded-md border px-2 py-1 transition-colors hover:border-red-400 hover:text-red-400 ${localVote === false ? 'border-red-400 text-red-400' : 'border-edge'}`}
      >
        ✗ {votes.unhelpful}
      </button>
      {savedLocally && (
        <span className="ml-1 text-[10px] text-faint">saved on this device</span>
      )}
    </div>
  );
}
