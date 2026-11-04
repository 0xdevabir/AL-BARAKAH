'use client';

import { formatTk } from '@albarakah/domain';
import { EmptyState, fmtDay, fmtRelative, fmtWhen, initials, LargeTitle, SearchField, Sheet, SkeletonList, StatTile, statusLabel, statusTone } from '@albarakah/ui';
import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useGet } from '@/lib/api';
import { downloadCsv, poishaToTk, telLink } from '@/lib/app';

interface Row { id: string; name: string; phone: string; email: string | null; isActive: boolean; createdAt: string; orders: number; consultations: number; spentPoisha: number; lastOrderAt: string | null }
interface Detail {
  id: string; name: string; phone: string; email: string | null; createdAt: string;
  addresses: { id: string; label: string; line: string; phone: string; zone: { name: string } }[];
  orders: { id: string; code: string; status: string; totalPoisha: number; createdAt: string; type: string; rating: number | null }[];
  consultations: { id: string; code: string; status: string; startsAt: string; doctor: { user: { name: string } } }[];
  spentPoisha: number; deliveredOrders: number;
}

export default function CustomersPage() {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim());
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setPage(1), [dq]);
  const { data: rows, pending } = useGet<Row[]>(`/admin/customers?page=${page}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`);

  return (
    <>
      <LargeTitle
        sub="Everyone who has ordered or booked"
        action={
          <button
            className="btn small"
            disabled={!rows?.length}
            onClick={() =>
              downloadCsv('customers', [
                ['Name', 'Phone', 'Email', 'Joined', 'Orders', 'Consultations', 'Spent (Tk)', 'Last order'],
                ...(rows ?? []).map((r) => [r.name, r.phone, r.email, r.createdAt.slice(0, 10), r.orders, r.consultations, poishaToTk(r.spentPoisha), r.lastOrderAt?.slice(0, 10)]),
              ])
            }
          >
            Export
          </button>
        }
      >
        Customers
      </LargeTitle>
      <div className="toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Name, phone or email" />
      </div>
      {pending ? <SkeletonList rows={8} /> : null}
      {rows && !rows.length ? <EmptyState icon="👥" title="No customers found" /> : null}
      {rows?.length ? (
        <div className="group cv">
          {rows.map((c) => (
            <button key={c.id} className="chev" onClick={() => setOpen(c.id)}>
              <span className="avatar">{initials(c.name || '?')}</span>
              <span className="cell-main">
                <strong>{c.name || 'No name'}</strong>
                <span className="cell-sub">
                  {c.phone} · {c.orders} orders{c.consultations ? ` · ${c.consultations} consults` : ''}
                  {c.lastOrderAt ? ` · last ${fmtRelative(c.lastOrderAt)}` : ''}
                </span>
              </span>
              <span className="small price">{formatTk(c.spentPoisha)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {rows && (page > 1 || rows.length === 30) ? (
        <div className="row between" style={{ marginTop: 14 }}>
          <button className="btn small" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="muted small">Page {page}</span>
          <button className="btn small" disabled={rows.length < 30} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      ) : null}
      <Sheet open={!!open} onClose={() => setOpen(null)} title="Customer">
        {open ? <CustomerDetail id={open} /> : null}
      </Sheet>
    </>
  );
}

function CustomerDetail({ id }: { id: string }) {
  const { data: c } = useGet<Detail>(`/admin/customers/${id}`);
  if (!c) return <SkeletonList rows={4} />;
  const rated = c.orders.filter((o) => o.rating);
  return (
    <div className="stack">
      <div className="row">
        <span className="avatar lg">{initials(c.name || '?')}</span>
        <span className="grow">
          <strong style={{ fontSize: '1.2rem' }}>{c.name || 'No name'}</strong>
          <span className="muted small" style={{ display: 'block' }}>Customer since {fmtDay(c.createdAt)}</span>
        </span>
        <a className="btn small" href={telLink(c.phone)} aria-label="Call"><Icon name="phone" size={18} /></a>
      </div>
      <div className="stats">
        <StatTile label="Lifetime spend" value={formatTk(c.spentPoisha)} />
        <StatTile label="Delivered" value={c.deliveredOrders} hint={`${c.orders.length} orders`} />
        <StatTile label="Avg rating given" value={rated.length ? (rated.reduce((s, o) => s + o.rating!, 0) / rated.length).toFixed(1) : '—'} />
      </div>
      {c.addresses.length ? (
        <>
          <p className="group-label">Addresses</p>
          <div className="group">
            {c.addresses.map((a) => (
              <div key={a.id}>
                <span className="cell-main">
                  <strong>{a.label} · {a.zone.name}</strong>
                  <span className="cell-sub">{a.line} · {a.phone}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <p className="group-label">Orders</p>
      {c.orders.length ? (
        <div className="group">
          {c.orders.map((o) => (
            <Link key={o.id} href={`/admin/orders?open=${o.id}`} className="chev">
              <span className="cell-main">
                <strong className="mono">{o.code}</strong>
                <span className="cell-sub">{fmtWhen(o.createdAt)}{o.rating ? ` · ${'★'.repeat(o.rating)}` : ''}</span>
              </span>
              <span className="cell-end">
                <span className={`chip ${statusTone(o.status)}`}>{statusLabel(o.status)}</span>
                <span className="small mono">{formatTk(o.totalPoisha)}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted small">No orders yet.</p>
      )}
      {c.consultations.length ? (
        <>
          <p className="group-label">Consultations</p>
          <div className="group">
            {c.consultations.map((x) => (
              <div key={x.id}>
                <span className="cell-main">
                  <strong>{x.doctor.user.name}</strong>
                  <span className="cell-sub">{fmtWhen(x.startsAt)} · {x.code}</span>
                </span>
                <span className={`chip ${statusTone(x.status)}`}>{statusLabel(x.status)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
