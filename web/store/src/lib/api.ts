'use client';

import { ApiClient } from '@albarakah/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';

const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const api = new ApiClient(base);

export function useApi() {
  const user = useSyncExternalStore(
    (onStoreChange) => api.subscribe(onStoreChange),
    () => api.user,
    () => null,
  );
  const ready = useSyncExternalStore(
    (onStoreChange) => api.subscribe(onStoreChange),
    () => api.ready,
    () => false,
  );
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    void api.restore().finally(() => setBooting(false));
  }, []);

  return { api, user, ready: ready && !booting };
}
