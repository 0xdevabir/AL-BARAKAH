'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * A tiny stale-while-revalidate cache. Screens render cached data instantly on return,
 * refetch quietly in the background, and share one request when several mount together.
 */
interface Entry<T = unknown> {
  data?: T;
  error?: Error;
  at: number;
  inflight?: Promise<T>;
  loading: boolean;
}

const store = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const EMPTY: Entry = { at: 0, loading: false };

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function entry(key: string): Entry {
  return store.get(key) ?? EMPTY;
}

function set(key: string, patch: Partial<Entry>) {
  store.set(key, { ...entry(key), ...patch });
  notify(key);
}

async function load<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cur = entry(key);
  if (cur.inflight) return cur.inflight as Promise<T>;
  const p = fetcher();
  set(key, { inflight: p, loading: true });
  try {
    const data = await p;
    set(key, { data, error: undefined, at: Date.now(), inflight: undefined, loading: false });
    return data;
  } catch (err) {
    set(key, { error: err as Error, inflight: undefined, loading: false });
    throw err;
  }
}

/** Marks matching keys stale and refetches any that are on screen. */
export function invalidate(prefix: string) {
  for (const [key, e] of store) {
    if (key.startsWith(prefix)) {
      store.set(key, { ...e, at: 0 });
      notify(key);
    }
  }
}

/** Optimistic local edit: changes what is on screen now, before the server answers. */
export function mutate<T>(key: string, update: (prev: T | undefined) => T) {
  set(key, { data: update(entry(key).data as T | undefined) });
}

export function clearQueries() {
  store.clear();
  for (const key of listeners.keys()) notify(key);
}

export interface QueryResult<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** True only on the very first load, when nothing is cached to show. */
  pending: boolean;
  refetch: () => Promise<T | undefined>;
}

export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  { staleMs = 15_000, pollMs }: { staleMs?: number; pollMs?: number } = {},
): QueryResult<T> {
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => undefined;
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },
    [key],
  );
  const snap = useSyncExternalStore(subscribe, () => (key ? entry(key) : EMPTY), () => EMPTY);

  const refetch = useCallback(async () => {
    if (!key) return undefined;
    try {
      return await load(key, () => fetchRef.current());
    } catch {
      return undefined;
    }
  }, [key]);

  // Fetch when missing or stale, including after invalidate() drops `at` to 0.
  useEffect(() => {
    if (!key) return;
    const e = entry(key);
    if (!e.inflight && Date.now() - e.at > staleMs) void refetch();
  }, [key, snap.at, staleMs, refetch]);

  useEffect(() => {
    if (!key) return;
    const onFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - entry(key).at > staleMs) void refetch();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('online', onFocus);
    const t = pollMs ? setInterval(() => document.visibilityState === 'visible' && void refetch(), pollMs) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('online', onFocus);
      if (t) clearInterval(t);
    };
  }, [key, staleMs, pollMs, refetch]);

  return {
    data: snap.data as T | undefined,
    error: snap.error,
    loading: snap.loading,
    pending: snap.data === undefined && !snap.error,
    refetch,
  };
}
