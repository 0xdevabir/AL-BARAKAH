'use client';

import { formatTk } from '@albarakah/domain';
import { fmtWhen } from '@albarakah/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Row {
  id: string;
  code: string;
  status: string;
  type: string;
  totalPoisha: number;
  promisedBy: string;
  addressSnapshot: { label?: string; line?: string } | null;
  items: { nameSnapshot: string; qty: number }[];
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      if (!api.ready) await api.restore();
      if (!api.user) {
        setOrders([]);
        return;
      }
      try {
        setOrders(await api.get<Row[]>('/orders'));
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  return (
    <div className="page">
      <h1 className="title">Orders</h1>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {orders && orders.length === 0 ? (
        <div className="empty stack">
          <p>No orders yet.</p>
          <Link className="btn primary" href="/search">
            Browse medicines
          </Link>
        </div>
      ) : null}
      {orders && orders.length > 0 ? (
        <div className="stack">
          {orders.map((o) => (
            <Link key={o.id} className="card order-card" href={`/orders/${o.id}`}>
              <span className="row between">
                <span className={`chip${o.status === 'DELIVERED' || o.status === 'CANCELLED' ? ' off' : ''}${o.status === 'FAILED' ? ' warn' : ''}`}>
                  {o.status}
                </span>
                <span className="price">{formatTk(o.totalPoisha)}</span>
              </span>
              <strong className="order-items">{o.items.map((i) => `${i.nameSnapshot} × ${i.qty}`).join(', ') || o.code}</strong>
              {o.addressSnapshot?.line ? (
                <>
                  <span style={{ fontWeight: 600 }}>{o.addressSnapshot.label}</span>
                  <span className="muted">{o.addressSnapshot.line}</span>
                </>
              ) : null}
              <span className="muted small">{fmtWhen(o.promisedBy)}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {!orders && !error ? <p className="muted">Loading…</p> : null}
    </div>
  );
}
