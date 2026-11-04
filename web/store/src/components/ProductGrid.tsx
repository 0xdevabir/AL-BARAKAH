'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Medicine } from '@/lib/cart';
import { ProductCard } from './ProductCard';

const AUTO_PAGES = 5;

export function ProductGrid({ q = '', category = '' }: { q?: string; category?: string }) {
  const key = `${q}|${category}`;
  const [items, setItems] = useState<Medicine[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [pageNo, setPageNo] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const ticket = useRef(0);
  const sentinel = useRef<HTMLSpanElement>(null);

  const run = useCallback(
    async (more = false) => {
      const id = ++ticket.current;
      const next = more ? pageNo + 1 : 1;
      setError('');
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(next),
          ...(q ? { q } : {}),
          ...(category ? { category } : {}),
        });
        const r = await api.get<{ items: Medicine[]; hasMore: boolean }>(`/medicines?${params}`);
        if (id !== ticket.current) return;
        setItems((prev) => (more ? [...prev, ...r.items] : r.items));
        setHasMore(q.trim() ? r.hasMore : false);
        setPageNo(next);
        setLoaded(true);
      } catch (err) {
        if (id === ticket.current) setError((err as Error).message);
      } finally {
        if (id === ticket.current) setLoading(false);
      }
    },
    [category, pageNo, q],
  );

  useEffect(() => {
    setLoaded(false);
    setItems([]);
    setPageNo(1);
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when key changes
  }, [key]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || !q.trim() || pageNo >= AUTO_PAGES) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && !error) void run(true);
      },
      { rootMargin: '600px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [error, hasMore, loading, pageNo, q, run]);

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
      <div className="empty">
        <p>No medicines matched that search.</p>
      </div>
    );
  }

  return (
    <div aria-busy={loading}>
      <div className="pgrid">
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
        {hasMore && q.trim() ? (
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
