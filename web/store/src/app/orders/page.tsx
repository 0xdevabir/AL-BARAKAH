'use client';

import { formatTk } from '@albarakah/domain';
import { EmptyState, fmtWhen, Segmented, SkeletonList, statusLabel, statusTone } from '@albarakah/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApi, useGet } from '@/lib/api';
import { reorder } from '@/lib/reorder';

interface Row {
  id: string; code: string; status: string; type: string; totalPoisha: number; promisedBy: string; createdAt: string;
  rating: number | null; addressSnapshot: { label?: string; line?: string } | null; items: { nameSnapshot: string; qty: number }[];
}

export default function OrdersPage() {
  const { user, ready } = useApi();
  const router = useRouter();
  const [scope, setScope] = useState<'active' | 'past'>('active');
  const [page, setPage] = useState(1);
  const { data: orders, pending, error } = useGet<Row[]>(user ? `/orders?scope=${scope}&page=${page}` : null, { pollMs: scope === 'active' ? 30_000 : undefined });

  if (ready && !user) {
    return (
      <div className="page">
        <h1 className="title">Orders</h1>
        <EmptyState icon="📦" title="Sign in to see your orders" action={<Link className="btn primary" href="/login?next=/orders">Sign in</Link>} />
      </div>
    );
  }

  return (
    <div className="page stack">
      <h1 className="title">Orders</h1>
      <Segmented
        label="Orders"
        value={scope}
        onChange={(v) => {
          setScope(v);
          setPage(1);
        }}
        options={[{ value: 'active', label: 'In progress' }, { value: 'past', label: 'Past' }]}
      />
      {error ? <p className="error" role="alert">{error.message}</p> : null}
      {pending || !ready ? <SkeletonList rows={3} /> : null}
      {orders && orders.length === 0 && page === 1 ? (
        <EmptyState
          icon={scope === 'active' ? '🛵' : '🧾'}
          title={scope === 'active' ? 'Nothing on the way' : 'No past orders'}
          action={<Link className="btn primary" href="/search">Browse medicines</Link>}
        />
      ) : null}
      <div className="stack stagger">
        {orders?.map((o) => (
          <Link key={o.id} className="card order-card press" href={`/orders/${o.id}`}>
            <span className="row between">
              <span className={`chip ${statusTone(o.status)}`}>{statusLabel(o.status)}</span>
              <span className="price">{formatTk(o.totalPoisha)}</span>
            </span>
            <strong className="order-items">{o.items.map((i) => `${i.nameSnapshot} × ${i.qty}`).join(', ') || o.code}</strong>
            {o.addressSnapshot?.line ? <span className="muted small">{o.addressSnapshot.label} · {o.addressSnapshot.line}</span> : null}
            <span className="row between">
              <span className="muted small">{fmtWhen(o.createdAt ?? o.promisedBy)}{o.type === 'EMERGENCY' ? ' · Emergency' : ''}</span>
              {scope === 'past' && o.status !== 'PLACED' ? (
                <button
                  type="button"
                  className="btn small"
                  onClick={async (e) => {
                    e.preventDefault();
                    if (await reorder(o.id)) router.push('/cart');
                  }}
                >
                  Reorder
                </button>
              ) : null}
            </span>
          </Link>
        ))}
      </div>
      {orders && (page > 1 || orders.length >= 30) ? (
        <div className="row between">
          <button className="btn small" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Newer</button>
          <span className="muted small">Page {page}</span>
          <button className="btn small" disabled={orders.length < 30} onClick={() => setPage((p) => p + 1)}>Older</button>
        </div>
      ) : null}
    </div>
  );
}
