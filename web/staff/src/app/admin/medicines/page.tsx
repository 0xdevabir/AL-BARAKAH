'use client';

import { formatTk } from '@albarakah/domain';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { message } from '@/lib/app';

interface Med {
  id: string;
  name: string;
  strength: string;
  pricePoisha: number;
  isActive: boolean;
  batches: { qtyRemaining: number }[];
}

export default function AdminMedicinesPage() {
  const [q, setQ] = useState('');
  const [meds, setMeds] = useState<Med[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      void api
        .get<Med[]>(`/admin/medicines?q=${encodeURIComponent(q.trim())}`)
        .then(setMeds)
        .catch((err) => setError(message(err)));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="page stack">
      <h1 className="title">Medicines</h1>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search catalogue" />
      {error ? <p className="error">{error}</p> : null}
      <div className="group">
        {meds.map((m) => {
          const stock = m.batches.reduce((n, b) => n + b.qtyRemaining, 0);
          return (
            <div key={m.id} className="row between">
              <span className="grow">
                <strong>{m.name}</strong> {m.strength}
                <span className="muted small" style={{ display: 'block' }}>
                  Stock {stock} · {m.isActive ? 'Active' : 'Off'}
                </span>
              </span>
              <span className="price">{formatTk(m.pricePoisha)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
