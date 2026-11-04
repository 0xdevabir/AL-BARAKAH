'use client';

import { formatTk } from '@albarakah/domain';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Medicine } from '@/lib/cart';

const LIMIT = 6;

export function SearchBox() {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Medicine[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const term = q.trim();

  useEffect(() => {
    let ticket = 0;
    const value = term;
    setActive(-1);
    if (value.length < 2) {
      setItems([]);
      return;
    }
    const id = ++ticket;
    const timer = setTimeout(async () => {
      try {
        const r = await api.get<{ items: Medicine[] }>(`/medicines?q=${encodeURIComponent(value)}`);
        if (id === ticket) setItems(r.items.slice(0, LIMIT));
      } catch {
        if (id === ticket) setItems([]);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [term]);

  function seeAll() {
    setOpen(false);
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      const size = items.length + 1;
      setActive((prev) => (e.key === 'ArrowDown' ? (prev + 1) % size : (prev <= 0 ? size : prev) - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && items[active]) {
        setOpen(false);
        router.push(`/medicine/${items[active]!.slug}`);
      } else seeAll();
    }
  }

  return (
    <div
      className="sbox"
      ref={box}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <input
        className="input"
        type="search"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls="search-suggestions"
        aria-autocomplete="list"
        aria-label="Search"
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Search medicines"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && items.length > 0 ? (
        <div className="slist" id="search-suggestions" role="listbox" tabIndex={-1}>
          {items.map((med, i) => (
            <Link
              key={med.id}
              id={`suggestion-${i}`}
              className={`sitem${i === active ? ' on' : ''}`}
              role="option"
              aria-selected={i === active}
              href={`/medicine/${med.slug}`}
              onClick={() => setOpen(false)}
            >
              {med.imageUrl ? (
                <img src={med.imageUrl} alt="" width={36} height={36} decoding="async" referrerPolicy="no-referrer" />
              ) : (
                <span className="blank" />
              )}
              <span className="grow text">
                <strong>
                  {med.name} {med.strength}
                </strong>
                <span className="muted small">
                  {med.genericName} · {med.form}
                  {med.packSize ? ` · ${med.packSize}` : ''}
                </span>
              </span>
              <span className="price">{formatTk(med.pricePoisha)}</span>
            </Link>
          ))}
          <Link
            className={`sitem all${active === items.length ? ' on' : ''}`}
            role="option"
            aria-selected={active === items.length}
            href={`/search?q=${encodeURIComponent(term)}`}
            onClick={() => setOpen(false)}
          >
            See all results for “{term}”
          </Link>
        </div>
      ) : null}
    </div>
  );
}
