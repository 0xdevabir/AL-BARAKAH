'use client';

import { ApiClient, type QueryResult, useQuery } from '@albarakah/ui';
import { useEffect, useSyncExternalStore } from 'react';

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

  // restore() is memoised inside the client, so this costs nothing after the first screen.
  useEffect(() => {
    void api.restore();
  }, []);

  return { api, user, ready };
}

/** Cached GET: instant on revisit, quietly refreshed in the background. */
export function useGet<T>(path: string | null, opts?: { staleMs?: number; pollMs?: number }): QueryResult<T> {
  return useQuery<T>(path, () => api.get<T>(path!), opts);
}
