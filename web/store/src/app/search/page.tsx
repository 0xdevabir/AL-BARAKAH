'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ProductGrid } from '@/components/ProductGrid';
import { api } from '@/lib/api';

function SearchInner() {
  const params = useSearchParams();
  const category = params.get('category') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [appliedQ, setAppliedQ] = useState(q);
  const [categories, setCategories] = useState<{ id: string; name: string; slug: string; count: number }[]>([]);

  useEffect(() => {
    void api.get<{ id: string; name: string; slug: string; count: number }[]>('/categories').then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(() => {
      setAppliedQ(term);
      const next = new URLSearchParams({
        ...(term ? { q: term } : {}),
        ...(category ? { category } : {}),
      });
      // Shallow URL update: keeps the link shareable without a Next.js navigation per keystroke.
      window.history.replaceState(null, '', `/search${next.size ? `?${next}` : ''}`);
    }, term ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, category]);

  const chipHref = (slug: string) => {
    const next = new URLSearchParams({
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(slug ? { category: slug } : {}),
    });
    return `/search${next.size ? `?${next}` : ''}`;
  };

  return (
    <div className="page wide">
      <h1 className="title">Search</h1>
      <div className="search-head">
        <input
          className="input find"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by brand or generic name"
          aria-label="Search"
          autoComplete="off"
          enterKeyHint="search"
        />
        {categories.length > 0 ? (
          <div className="chips">
            <Link className={`btn small${!category ? ' primary' : ''}`} href={chipHref('')}>
              All
            </Link>
            {categories.map((c) => (
              <Link key={c.id} className={`btn small${category === c.slug ? ' primary' : ''}`} href={chipHref(c.slug)}>
                {c.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      {!appliedQ.trim() ? <p className="hint muted">Type a name to search the full catalogue. Without a query you see popular picks.</p> : null}
      <div className="results">
        <ProductGrid q={appliedQ} category={category} />
      </div>
      {appliedQ.trim() ? (
        <p className="hint muted">
          Can&rsquo;t find it? <Link href={`/requests?name=${encodeURIComponent(appliedQ.trim())}`}>Request a medicine</Link> or <Link href="/prescription">upload your prescription</Link>.
        </p>
      ) : null}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="page muted">Loading…</div>}>
      <SearchInner />
    </Suspense>
  );
}
