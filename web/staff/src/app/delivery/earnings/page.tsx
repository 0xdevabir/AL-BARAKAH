'use client';

import { formatTk } from '@albarakah/domain';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { message } from '@/lib/app';

export default function EarningsPage() {
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void api
      .get<{ totalPoisha: number }>('/delivery/earnings')
      .then((r) => setTotal(r.totalPoisha))
      .catch((err) => setError(message(err)));
  }, []);

  return (
    <div className="page stack">
      <h1 className="title">Earnings</h1>
      {error ? <p className="error">{error}</p> : null}
      {total !== null ? (
        <div className="card">
          <span className="muted small">Total earned</span>
          <strong className="mono" style={{ fontSize: '2rem', display: 'block' }}>
            {formatTk(total)}
          </strong>
        </div>
      ) : !error ? (
        <p className="muted">Loading…</p>
      ) : null}
    </div>
  );
}
