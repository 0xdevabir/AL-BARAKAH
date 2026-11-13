'use client';

import { formatTk } from '@albarakah/domain';
import { EmptyState, fmtRelative, invalidate, Segmented, SkeletonList, StatTile, toast } from '@albarakah/ui';
import { useState } from 'react';
import { api, useGet } from '@/lib/api';
import { downloadCsv, message } from '@/lib/app';

interface Inventory {
  totals: { medicines: number; packsInStock: number; stockValuePoisha: number; outOfStock: number; low: number; rare: number };
  items: { id: string; name: string; packs: number; loose: number; reorderLevel: number; sourcingDays: number; valuePoisha: number; requests: number }[];
}

/** Every active medicine with what is on the shelf (unexpired batches only), lowest first. */
export function StockView() {
  const { data, pending, error } = useGet<Inventory>('/admin/inventory', { staleMs: 30_000 });
  const [show, setShow] = useState<'all' | 'out' | 'low'>('all');
  if (error && !data) return <p className="error">{error.message}</p>;
  if (pending || !data) return <SkeletonList rows={6} />;
  const t = data.totals;
  const items = data.items.filter((i) =>
    show === 'out' ? i.packs === 0 && i.loose === 0 : show === 'low' ? i.packs > 0 && i.packs <= i.reorderLevel : true,
  );

  return (
    <>
      <div className="stats">
        <StatTile label="Packs on the shelf" value={t.packsInStock.toLocaleString('en-IN')} hint={`${t.medicines} medicines`} />
        <StatTile label="Stock value" value={formatTk(t.stockValuePoisha)} hint="at selling price" />
        <StatTile label="Out of stock" value={t.outOfStock} tone={t.outOfStock ? 'bad' : undefined} />
        <StatTile label="Low stock" value={t.low} tone={t.low ? 'warn' : undefined} hint={`${t.rare} sourced on order`} />
      </div>
      <div className="toolbar">
        <Segmented<'all' | 'out' | 'low'>
          label="Show"
          value={show}
          onChange={setShow}
          options={[{ value: 'all', label: 'All' }, { value: 'out', label: 'Out' }, { value: 'low', label: 'Low' }]}
        />
        <button
          className="btn small"
          onClick={() => downloadCsv('stock', [['Medicine', 'Packs', 'Loose', 'Reorder at', 'Sourcing days', 'Open requests'], ...data.items.map((i) => [i.name, i.packs, i.loose, i.reorderLevel, i.sourcingDays, i.requests])])}
        >
          Export
        </button>
      </div>
      {items.length ? (
        <div className="group cv">
          {items.map((i) => (
            <div key={i.id} className="cell">
              <span className="cell-main">
                <strong>{i.name}</strong>
                <span className="cell-sub">
                  Reorder at {i.reorderLevel}
                  {i.sourcingDays ? ` · sourced on order (+${i.sourcingDays}d)` : ''}
                  {i.requests ? ` · ${i.requests} waiting` : ''}
                </span>
              </span>
              <span className={`chip ${i.packs === 0 && i.loose === 0 ? 'bad' : i.packs <= i.reorderLevel ? 'warn' : ''}`}>
                {i.packs} packs{i.loose ? ` + ${i.loose} loose` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon="📦" title="Nothing here" />
      )}
    </>
  );
}

type ReqStatus = 'OPEN' | 'SOURCING' | 'FULFILLED' | 'CLOSED';
interface Requests {
  rows: {
    id: string; name: string; qty: number; note: string | null; status: ReqStatus; createdAt: string;
    user: { name: string; phone: string }; medicine: { id: string; name: string; strength: string } | null;
  }[];
  demand: { key: string; name: string; medicineId: string | null; requests: number; qty: number }[];
}
const STATUS_LABEL: Record<ReqStatus, string> = { OPEN: 'New', SOURCING: 'Sourcing', FULFILLED: 'Available', CLOSED: 'Closed' };
const STATUS_TONE: Record<ReqStatus, string> = { OPEN: 'live', SOURCING: 'warn', FULFILLED: 'ok', CLOSED: 'off' };

/** Medicines customers asked for: grouped by demand so the most-wanted are sourced first. */
export function MedicineRequests() {
  const [status, setStatus] = useState<'' | ReqStatus>('');
  const { data, pending, error } = useGet<Requests>(`/admin/medicine-requests${status ? `?status=${status}` : ''}`, { pollMs: 60_000 });
  const [busy, setBusy] = useState('');

  async function setTo(id: string, to: ReqStatus) {
    setBusy(id);
    try {
      await api.patch(`/admin/medicine-requests/${id}`, { status: to });
      toast(to === 'FULFILLED' ? 'Customer told it is available' : to === 'SOURCING' ? 'Customer told you are sourcing it' : 'Updated');
      invalidate('/admin/medicine-requests');
      invalidate('/admin/inventory');
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <div className="toolbar">
        <Segmented<'' | ReqStatus>
          label="Status"
          value={status}
          onChange={setStatus}
          options={[{ value: '', label: 'Open' }, { value: 'FULFILLED', label: 'Available' }, { value: 'CLOSED', label: 'Closed' }]}
        />
      </div>
      {error && !data ? <p className="error">{error.message}</p> : null}
      {pending ? <SkeletonList rows={5} /> : null}
      {data && !data.rows.length ? <EmptyState icon="📝" title="No requests">Customers ask for medicines you don’t stock from the store.</EmptyState> : null}

      {data?.demand.length && !status ? (
        <>
          <p className="group-label">Most wanted</p>
          <div className="group">
            {data.demand.slice(0, 8).map((d) => (
              <div key={d.key} className="cell">
                <span className="cell-main">
                  <strong>{d.name}</strong>
                  <span className="cell-sub">{d.medicineId ? 'In the catalogue · out of stock' : 'Not in the catalogue'}</span>
                </span>
                <span className="chip">{d.requests} {d.requests === 1 ? 'person' : 'people'} · {d.qty} packs</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {data?.rows.length ? (
        <>
          <p className="group-label">Requests</p>
          <div className="group cv">
            {data.rows.map((r) => (
              <div key={r.id} className="cell" style={{ flexWrap: 'wrap' }}>
                <span className="cell-main">
                  <strong>{r.medicine ? `${r.medicine.name} ${r.medicine.strength}` : r.name} × {r.qty}</strong>
                  <span className="cell-sub">
                    {r.user.name || 'Customer'} · <a href={`tel:${r.user.phone}`}>{r.user.phone}</a> · {fmtRelative(r.createdAt)}
                  </span>
                  {r.note ? <span className="cell-sub">“{r.note}”</span> : null}
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <span className={`chip ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  {r.status === 'OPEN' ? <button className="btn small" disabled={busy === r.id} onClick={() => void setTo(r.id, 'SOURCING')}>Sourcing</button> : null}
                  {r.status === 'OPEN' || r.status === 'SOURCING' ? (
                    <>
                      <button className="btn small primary" disabled={busy === r.id} onClick={() => void setTo(r.id, 'FULFILLED')}>Available</button>
                      <button className="btn small" disabled={busy === r.id} onClick={() => void setTo(r.id, 'CLOSED')}>Close</button>
                    </>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
