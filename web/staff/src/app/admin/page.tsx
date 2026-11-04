'use client';

import { formatTk } from '@albarakah/domain';
import { fmtWhen, Sheet } from '@albarakah/ui';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { message, statusLabel } from '@/lib/app';

interface Order {
  id: string;
  code: string;
  status: string;
  totalPoisha: number;
  promisedBy: string;
  addressSnapshot: { line: string };
  items: { id: string; nameSnapshot: string; qty: number }[];
  customer: { name: string; phone: string };
  rider: { id: string; name: string } | null;
}
interface Rider { id: string; name: string; isActive: boolean }

const FILTERS = ['', 'PLACED', 'CONFIRMED', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED'];
const NEXT: Record<string, string[]> = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ASSIGNED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['FAILED'],
  FAILED: ['ASSIGNED', 'CANCELLED'],
};

export default function AdminOrdersPage() {
  const [status, setStatus] = useState('PLACED');
  const [orders, setOrders] = useState<Order[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [open, setOpen] = useState(false);
  const [riderId, setRiderId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setOrders(await api.get<Order[]>(`/admin/orders?page=1${status ? `&status=${status}` : ''}`));
    } catch (err) {
      setError(message(err));
    }
  }

  useEffect(() => {
    void load();
    void api
      .get<Rider[]>('/admin/staff?role=RIDER')
      .then((r) => setRiders(r.filter((x) => x.isActive)))
      .catch((err) => setError(message(err)));
  }, [status]);

  async function move(to: string) {
    if (to === 'ASSIGNED' && !riderId) {
      setError('Choose a delivery person first.');
      return;
    }
    if (to === 'CANCELLED' && !confirm(`Cancel order ${selected!.code}?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/admin/orders/${selected!.id}/status`, {
        to,
        ...(to === 'ASSIGNED' ? { riderId } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setOpen(false);
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1 className="title">Orders</h1>
      <label className="field">
        <span>Status</span>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {FILTERS.map((f) => (
            <option key={f || 'all'} value={f}>
              {f ? statusLabel(f) : 'All'}
            </option>
          ))}
        </select>
      </label>
      {error && !open ? <p className="error">{error}</p> : null}
      <div className="stack" style={{ marginTop: 16 }}>
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            className="card"
            style={{ textAlign: 'left', width: '100%', border: 0, font: 'inherit', cursor: 'pointer' }}
            onClick={() => {
              setSelected(o);
              setRiderId(o.rider?.id ?? '');
              setNote('');
              setError('');
              setOpen(true);
            }}
          >
            <span className="row between">
              <span className="chip">{statusLabel(o.status)}</span>
              <span className="price">{formatTk(o.totalPoisha)}</span>
            </span>
            <strong>{o.code}</strong>
            <span className="muted small">{o.customer.name} · {fmtWhen(o.promisedBy)}</span>
          </button>
        ))}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={selected?.code ?? 'Order'}>
        {selected ? (
          <div className="stack">
            <p className="muted">{selected.addressSnapshot.line}</p>
            <div className="group">
              {selected.items.map((i) => (
                <div key={i.id}>
                  {i.nameSnapshot} × {i.qty}
                </div>
              ))}
            </div>
            {(NEXT[selected.status] ?? []).includes('ASSIGNED') ? (
              <label className="field">
                <span>Rider</span>
                <select className="input" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
                  <option value="">Choose…</option>
                  {riders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field">
              <span>Note</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <div className="stack">
              {(NEXT[selected.status] ?? []).map((to) => (
                <button key={to} className={`btn block${to === 'CANCELLED' ? ' danger' : ' primary'}`} type="button" disabled={busy} onClick={() => void move(to)}>
                  Mark {statusLabel(to)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
