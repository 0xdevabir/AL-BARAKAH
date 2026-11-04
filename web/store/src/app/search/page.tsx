'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { BrandLockup } from '@/components/BrandLockup';
import { ProductGrid } from '@/components/ProductGrid';
import { api } from '@/lib/api';

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const category = params.get('category') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [appliedQ, setAppliedQ] = useState(q);
  const [categories, setCategories] = useState<{ id: string; name: string; slug: string; count: number }[]>([]);

  useEffect(() => {
    void api.get<{ id: string; name: string; slug: string; count: number }[]>('/categories').then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedQ(q);
      const next = new URLSearchParams({
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(category ? { category } : {}),
      });
      const target = `/search${next.size ? `?${next}` : ''}`;
      router.replace(target);
    }, q ? 150 : 0);
    return () => clearTimeout(t);
  }, [q, category, router]);

  const chipHref = (slug: string) => {
    const next = new URLSearchParams({
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(slug ? { category: slug } : {}),
    });
    return `/search${next.size ? `?${next}` : ''}`;
  };

  return (
    <div className="page wide">
      <BrandLockup size={26} />
      <h1 className="title">Search</h1>
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
      {!appliedQ.trim() ? <p className="hint muted">Type a name to search the full catalogue. Without a query you see popular picks.</p> : null}
      <div className="results">
        <ProductGrid q={appliedQ} category={category} />
      </div>
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
