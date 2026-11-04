'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Medicine } from '@/lib/cart';
import { ProductCard } from './ProductCard';

const AUTO_PAGES = 8;

/** First page of recent queries, so backspacing / revisiting a term is instant. */
type Page = { items: Medicine[]; hasMore: boolean };
const firstPages = new Map<string, { page: Page; at: number }>();
const CACHE_MS = 60_000;
const CACHE_MAX = 40;

export function ProductGrid({ q = '', category = '' }: { q?: string; category?: string }) {
  const key = `${q}|${category}`;
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [items, setItems] = useState<Medicine[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [pageNo, setPageNo] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const ticket = useRef(0);
  const pageRef = useRef(1);
  const loadingRef = useRef(false);
  const sentinel = useRef<HTMLSpanElement>(null);

  const run = useCallback(
    async (more = false) => {
      // Only "load more" waits for an in-flight request; a new query supersedes it (stale replies are dropped by ticket).
      if (more && loadingRef.current) return;
      const id = ++ticket.current;
      const next = more ? pageRef.current + 1 : 1;
      const apply = (r: Page) => {
        setItems((prev) => (more ? [...prev, ...r.items] : r.items));
        setHasMore(r.hasMore);
        pageRef.current = next;
        setPageNo(next);
        setShownKey(key);
        setLoaded(true);
      };
      setError('');
      const hit = more ? undefined : firstPages.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) {
        apply(hit.page);
        setLoading(false);
        loadingRef.current = false;
        return;
      }
      setLoading(true);
      loadingRef.current = true;
      try {
        const params = new URLSearchParams({
          page: String(next),
          ...(q ? { q } : {}),
          ...(category ? { category } : {}),
        });
        const r = await api.get<Page>(`/medicines?${params}`);
        if (!more) {
          firstPages.delete(key);
          firstPages.set(key, { page: r, at: Date.now() });
          if (firstPages.size > CACHE_MAX) firstPages.delete(firstPages.keys().next().value!);
        }
        if (id !== ticket.current) return;
        apply(r);
      } catch (err) {
        if (id === ticket.current) setError((err as Error).message);
      } finally {
        if (id === ticket.current) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    },
    [category, key, q],
  );

  // New query: keep the previous results on screen (dimmed) until the new page arrives — no skeleton flash per keystroke.
  useEffect(() => {
    void run(false);
  }, [run]);

  const stale = loaded && shownKey !== key;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || stale || pageNo >= AUTO_PAGES) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current && !error) void run(true);
      },
      { rootMargin: '600px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [error, hasMore, pageNo, run, stale]);

  if (error && !items.length) {
    return (
      <div className="empty stack">
        <p>{error}</p>
        <button className="btn" type="button" onClick={() => void run()}>
          Retry
        </button>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="pgrid" aria-hidden="true">
        {Array.from({ length: 10 }, (_, n) => (
          <div key={n} className="ghost" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty" aria-busy={stale} style={stale ? { opacity: 0.55 } : undefined}>
        <p>{stale ? 'Searching…' : 'No medicines matched that search.'}</p>
      </div>
    );
  }

  return (
    <div aria-busy={loading}>
      <div className="pgrid" style={stale ? { opacity: 0.55, transition: 'opacity 120ms' } : undefined}>
        {items.map((med) => (
          <ProductCard key={med.id} medicine={med} />
        ))}
      </div>
      <div className="pgrid-foot">
        {error ? (
          <>
            <p className="error">{error}</p>
            <button className="btn" type="button" onClick={() => void run(true)}>
              Retry
            </button>
          </>
        ) : null}
        {hasMore ? (
          <>
            {pageNo < AUTO_PAGES ? <span ref={sentinel} className="sentinel" /> : null}
            <button className="btn" type="button" disabled={loading} onClick={() => void run(true)}>
              Load more
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
