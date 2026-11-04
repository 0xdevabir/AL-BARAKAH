'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Medicine } from '@/lib/cart';
import { ProductCard } from './ProductCard';

const AUTO_PAGES = 8;

export function ProductGrid({ q = '', category = '' }: { q?: string; category?: string }) {
  const key = `${q}|${category}`;
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
      if (loadingRef.current) return;
      const id = ++ticket.current;
      const next = more ? pageRef.current + 1 : 1;
      setError('');
      setLoading(true);
      loadingRef.current = true;
      try {
        const params = new URLSearchParams({
          page: String(next),
          ...(q ? { q } : {}),
          ...(category ? { category } : {}),
        });
        const r = await api.get<{ items: Medicine[]; hasMore: boolean }>(`/medicines?${params}`);
        if (id !== ticket.current) return;
        setItems((prev) => (more ? [...prev, ...r.items] : r.items));
        setHasMore(r.hasMore);
        pageRef.current = next;
        setPageNo(next);
        setLoaded(true);
      } catch (err) {
        if (id === ticket.current) setError((err as Error).message);
      } finally {
        if (id === ticket.current) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    },
    [category, q],
  );

  useEffect(() => {
    ticket.current += 1;
    pageRef.current = 1;
    setLoaded(false);
    setItems([]);
    setPageNo(1);
    setHasMore(false);
    void run(false);
  }, [key, run]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || pageNo >= AUTO_PAGES) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current && !error) void run(true);
      },
      { rootMargin: '600px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [error, hasMore, pageNo, run]);

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
