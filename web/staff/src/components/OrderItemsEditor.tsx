'use client';

import { formatTk } from '@albarakah/domain';
import { invalidate, SearchField, toast } from '@albarakah/ui';
import { useDeferredValue, useState } from 'react';
import { api, useGet } from '@/lib/api';
import { message } from '@/lib/app';

interface Hit { id: string; name: string; strength: string; packSize: string; pricePoisha: number; stock: number; isActive: boolean }
interface Line { medicineId: string; name: string; pricePoisha: number; stock: number; qty: number }

/**
 * For orders placed from a prescription photo: the pharmacist reads the photo, picks each medicine
 * from the catalogue and saves. The total is recalculated and the customer is notified to confirm by phone.
 */
export function OrderItemsEditor({ orderId, hasItems, onSaved }: { orderId: string; hasItems: boolean; onSaved: () => void }) {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim());
  const { data: hits } = useGet<Hit[]>(dq.length >= 2 ? `/admin/medicines?q=${encodeURIComponent(dq)}` : null, { staleMs: 30_000 });
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  function add(h: Hit) {
    setLines((prev) =>
      prev.some((l) => l.medicineId === h.id)
        ? prev.map((l) => (l.medicineId === h.id ? { ...l, qty: Math.min(50, l.qty + 1) } : l))
        : [...prev, { medicineId: h.id, name: `${h.name} ${h.strength}`.trim(), pricePoisha: h.pricePoisha, stock: h.stock, qty: 1 }],
    );
    setQ('');
  }
  const setQty = (id: string, qty: number) =>
    setLines((prev) => (qty <= 0 ? prev.filter((l) => l.medicineId !== id) : prev.map((l) => (l.medicineId === id ? { ...l, qty: Math.min(50, qty) } : l))));

  async function save() {
    setBusy(true);
    try {
      await api.put(`/admin/orders/${orderId}/items`, {
        items: lines.map((l) => ({ medicineId: l.medicineId, qty: l.qty, unit: 'PACK' })),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast('Items saved — call the customer to confirm the total');
      setLines([]);
      setNote('');
      invalidate('/admin/orders');
      onSaved();
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.pricePoisha * l.qty, 0);
  const short = lines.filter((l) => l.qty > l.stock);

  return (
    <div className="panel stack" style={{ gap: 10 }}>
      <span className="muted small">
        {hasItems ? 'Saving replaces the items above.' : 'Read the prescription, then add each medicine from the catalogue.'}
      </span>
      <SearchField value={q} onChange={setQ} placeholder="Find a medicine to add" />
      {dq.length >= 2 && hits ? (
        <ul className="pick-list">
          {hits.filter((h) => h.isActive).slice(0, 6).map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => add(h)}>
                <span className="grow">
                  <strong>{h.name} {h.strength}</strong>
                  <span className="cell-sub" style={{ display: 'block' }}>{h.packSize} · {formatTk(h.pricePoisha)} · {h.stock ? `${h.stock} in stock` : 'out of stock'}</span>
                </span>
                <span className="chip">Add</span>
              </button>
            </li>
          ))}
          {!hits.length ? <li className="muted small" style={{ padding: 10 }}>No match. Add it to the catalogue first.</li> : null}
        </ul>
      ) : null}

      {lines.map((l) => (
        <div key={l.medicineId} className="line-item">
          <span className="grow">
            {l.name}
            <span className={`cell-sub small${l.qty > l.stock ? ' bad' : ''}`} style={{ display: 'block' }}>
              {formatTk(l.pricePoisha)} each{l.qty > l.stock ? ` · only ${l.stock} in stock` : ''}
            </span>
          </span>
          <span className="stepper">
            <button type="button" className="btn small" aria-label="One less" onClick={() => setQty(l.medicineId, l.qty - 1)}>−</button>
            <span className="mono">{l.qty}</span>
            <button type="button" className="btn small" aria-label="One more" onClick={() => setQty(l.medicineId, l.qty + 1)}>+</button>
          </span>
        </div>
      ))}

      {lines.length ? (
        <>
          <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Note for the order history (optional)" />
          {short.length ? <p className="notice bad small">Not enough stock for {short.map((l) => l.name).join(', ')}. Saving will fail until it is restocked.</p> : null}
          <div className="row between">
            <span>Medicines <strong className="mono">{formatTk(subtotal)}</strong></span>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save items'}</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
