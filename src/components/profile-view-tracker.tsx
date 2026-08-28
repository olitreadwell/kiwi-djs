'use client';

import { useEffect } from 'react';

export function ProfileViewTracker({ djId }: { djId: string }) {
  useEffect(() => {
    void fetch(`/api/djs/${djId}/view`, { method: 'POST' }).catch(() => undefined);
  }, [djId]);
  return null;
}
