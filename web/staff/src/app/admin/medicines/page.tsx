'use client';

import { formatTk } from '@albarakah/domain';
import {
  EmptyState, fmtShortDay, invalidate, LargeTitle, promptText, SearchField, Segmented, Sheet, SkeletonList, Switch, toast,
} from '@albarakah/ui';
import { useSearchParams } from 'next/navigation';
import { Suspense, useDeferredValue, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api, useGet } from '@/lib/api';
import { downloadCsv, message, poishaToTk, tkToPoisha } from '@/lib/app';

interface Batch { id: string; batchNo: string; expiresAt: string; qtyRemaining: number }
interface Med {
  id: string; slug: string; name: string; genericName: string; manufacturer: string; form: string; strength: string; packSize: string;
  pricePoisha: number; isRx: boolean; isActive: boolean; categoryId: string; description: string; imageUrl: string; reorderLevel: number;
  category: { name: string }; batches: Batch[]; stock: number; lowStock: boolean; expiringSoon: boolean; expiredQty: number;
}
interface Category { id: string; name: string; count: number }
type Filter = 'all' | 'low' | 'expiring' | 'inactive';

export default function MedicinesPage() {
  return (
    <Suspense fallback={<SkeletonList rows={6} />}>
      <Catalog />
    </Suspense>
  );
}

function Catalog() {
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get('filter') as Filter) ?? 'all');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim());
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Med | 'new' | null>(null);

  const qs = new URLSearchParams();
  if (dq) qs.set('q', dq);
  if (filter !== 'all') qs.set('filter', filter);
  if (category) qs.set('category', category);
  const { data: meds, pending, error } = useGet<Med[]>(`/admin/medicines?${qs}`);
  const { data: cats } = useGet<Category[]>('/categories', { staleMs: 300_000 });

  // Keep the open editor in sync after a save or batch change.
  const current = editing && editing !== 'new' ? (meds?.find((m) => m.id === editing.id) ?? editing) : editing;

  function exportCsv() {
    if (!meds) return;
    downloadCsv('catalog', [
      ['Name', 'Strength', 'Generic', 'Form', 'Category', 'Price (Tk)', 'Stock', 'Reorder level', 'Rx', 'Active'],
      ...meds.map((m) => [m.name, m.strength, m.genericName, m.form, m.category.name, poishaToTk(m.pricePoisha), m.stock, m.reorderLevel, m.isRx ? 'yes' : 'no', m.isActive ? 'yes' : 'no']),
    ]);
  }

  return (
    <>
      <LargeTitle
        sub={meds ? `${meds.length} items${meds.length === 200 ? '+' : ''}` : 'Medicines, stock and batches'}
        action={
          <span className="row" style={{ gap: 8 }}>
            <button className="btn small" onClick={exportCsv} disabled={!meds?.length}>Export</button>
            <button className="btn small primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={16} /> New
            </button>
          </span>
        }
      >
        Catalog
      </LargeTitle>

      <div className="toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Name, generic or maker" />
        <select className="input select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {cats?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="toolbar">
        <Segmented<Filter>
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'low', label: 'Low stock' },
            { value: 'expiring', label: 'Expiring' },
            { value: 'inactive', label: 'Hidden' },
          ]}
        />
      </div>

      {error && !meds ? <p className="error">{error.message}</p> : null}
      {pending ? <SkeletonList rows={8} /> : null}
      {meds && !meds.length ? <EmptyState icon="💊" title="No medicines match">Try another search or filter.</EmptyState> : null}

      {meds?.length ? (
        <div className="group cv">
          {meds.map((m) => (
            <button key={m.id} className="chev" onClick={() => setEditing(m)}>
              {m.imageUrl ? <img src={m.imageUrl} alt="" className="thumb" loading="lazy" /> : <span className="cell-icon">{m.form.slice(0, 2)}</span>}
              <span className="cell-main">
                <strong>
                  {m.name} <span className="muted small">{m.strength}</span>
                </strong>
                <span className="cell-sub">
                  {m.genericName} · {m.category.name}
                </span>
              </span>
              <span className="cell-end">
                <span className="small price">{formatTk(m.pricePoisha)}</span>
                <span className="row" style={{ gap: 4 }}>
                  {!m.isActive ? <span className="chip off">Hidden</span> : null}
                  {m.isRx ? <span className="chip warn">Rx</span> : null}
                  <span className={`chip ${m.stock === 0 ? 'bad' : m.lowStock ? 'warn' : ''}`}>{m.stock} in stock</span>
                  {m.expiredQty ? <span className="chip bad">{m.expiredQty} expired</span> : null}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={current === 'new' ? 'New medicine' : (current?.name ?? '')}>
        {current ? <Editor med={current === 'new' ? null : current} cats={cats ?? []} onSaved={(m) => setEditing(m ?? null)} /> : null}
      </Sheet>
    </>
  );
}

function Editor({ med, cats, onSaved }: { med: Med | null; cats: Category[]; onSaved: (m: Med | null) => void }) {
  const [f, setF] = useState({
    name: med?.name ?? '', genericName: med?.genericName ?? '', manufacturer: med?.manufacturer ?? '', form: med?.form ?? 'Tablet',
    strength: med?.strength ?? '', packSize: med?.packSize ?? '', price: med ? poishaToTk(med.pricePoisha) : '', isRx: med?.isRx ?? false,
    isActive: med?.isActive ?? true, categoryId: med?.categoryId ?? cats[0]?.id ?? '', description: med?.description ?? '',
    imageUrl: med?.imageUrl ?? '', reorderLevel: String(med?.reorderLevel ?? 10),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const pricePoisha = tkToPoisha(f.price);
    if (pricePoisha === null) return toast('Enter a price like 12 or 12.50', 'bad');
    setBusy(true);
    try {
      const body = { ...f, pricePoisha, reorderLevel: Number(f.reorderLevel) || 0, price: undefined };
      const saved = med ? await api.patch<Med>(`/admin/medicines/${med.id}`, body) : await api.post<Med>('/admin/medicines', body);
      toast(med ? 'Saved' : 'Medicine added');
      invalidate('/admin/medicines');
      invalidate('/admin/dashboard');
      if (!med) onSaved(null);
      else onSaved({ ...med, ...saved });
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <form className="form-grid two" onSubmit={(e) => void save(e)}>
        <label className="field span">Brand name<input className="input" required value={f.name} onChange={set('name')} /></label>
        <label className="field span">Generic name<input className="input" required value={f.genericName} onChange={set('genericName')} /></label>
        <label className="field">Strength<input className="input" placeholder="500 mg" value={f.strength} onChange={set('strength')} /></label>
        <label className="field">Form
          <select className="input" value={f.form} onChange={set('form')}>
            {['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Cream', 'Ointment', 'Drops', 'Inhaler', 'Powder', 'Device', 'Other'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="field">Pack size<input className="input" placeholder="10 tablets" value={f.packSize} onChange={set('packSize')} /></label>
        <label className="field">Manufacturer<input className="input" value={f.manufacturer} onChange={set('manufacturer')} /></label>
        <label className="field">Price (Tk)<input className="input" inputMode="decimal" required value={f.price} onChange={set('price')} /></label>
        <label className="field">Reorder at<input className="input" inputMode="numeric" value={f.reorderLevel} onChange={set('reorderLevel')} /></label>
        <label className="field span">Category
          <select className="input" value={f.categoryId} onChange={set('categoryId')} required>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="field span">Image URL<input className="input" type="url" placeholder="https://…" value={f.imageUrl} onChange={set('imageUrl')} /></label>
        <label className="field span">Description<textarea className="input" value={f.description} onChange={set('description')} /></label>
        <div className="group span">
          <div><span className="grow">Needs a prescription</span><Switch label="Needs a prescription" checked={f.isRx} onChange={(v) => setF({ ...f, isRx: v })} /></div>
          <div><span className="grow">Visible in the store</span><Switch label="Visible in the store" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} /></div>
        </div>
        <button className="btn primary block span" disabled={busy}>{busy ? 'Saving…' : med ? 'Save changes' : 'Add medicine'}</button>
      </form>

      {med ? <Batches med={med} /> : null}
    </div>
  );
}

function Batches({ med }: { med: Med }) {
  const [b, setB] = useState({ batchNo: '', expiresAt: '', qty: '' });
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/admin/medicines/${med.id}/batches`, { batchNo: b.batchNo, expiresAt: b.expiresAt, qty: Number(b.qty) });
      toast(`Batch ${b.batchNo} received`);
      setB({ batchNo: '', expiresAt: '', qty: '' });
      invalidate('/admin/medicines');
      invalidate('/admin/dashboard');
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function writeOff(batch: Batch) {
    const qty = await promptText({ title: `Write off from #${batch.batchNo}`, message: `${batch.qtyRemaining} units left.`, placeholder: 'Units', confirm: 'Next', required: true, initial: String(batch.qtyRemaining) });
    if (qty === null) return;
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1 || n > batch.qtyRemaining) return toast('Enter a whole number up to the units left', 'bad');
    const reason = await promptText({ title: 'Reason', placeholder: 'Expired, damaged, recalled…', confirm: 'Write off', required: true, destructive: true });
    if (reason === null) return;
    try {
      await api.post(`/admin/batches/${batch.id}/write-off`, { qty: n, reason });
      toast(`${n} units written off`);
      invalidate('/admin/medicines');
      invalidate('/admin/dashboard');
    } catch (err) {
      toast(message(err), 'bad');
    }
  }

  return (
    <>
      <p className="group-label">Batches · {med.stock} usable</p>
      {med.batches.length ? (
        <div className="group">
          {med.batches.map((x) => {
            const expired = x.expiresAt.slice(0, 10) < today;
            return (
              <div key={x.id}>
                <span className="cell-main">
                  <strong className="mono">#{x.batchNo}</strong>
                  <span className={`cell-sub${expired ? ' late' : ''}`}>{expired ? 'Expired' : 'Expires'} {fmtShortDay(x.expiresAt)} {x.expiresAt.slice(0, 4)}</span>
                </span>
                <span className="mono">{x.qtyRemaining}</span>
                {x.qtyRemaining > 0 ? <button className="btn small danger" onClick={() => void writeOff(x)}>Write off</button> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted small">No stock received yet.</p>
      )}
      <form className="form-grid two panel" onSubmit={(e) => void add(e)}>
        <strong className="span">Receive stock</strong>
        <label className="field">Batch no.<input className="input" required value={b.batchNo} onChange={(e) => setB({ ...b, batchNo: e.target.value })} /></label>
        <label className="field">Units<input className="input" inputMode="numeric" required pattern="\d+" value={b.qty} onChange={(e) => setB({ ...b, qty: e.target.value })} /></label>
        <label className="field span">Expiry date<input className="input" type="date" min={today} required value={b.expiresAt} onChange={(e) => setB({ ...b, expiresAt: e.target.value })} /></label>
        <button className="btn block span" disabled={busy}>{busy ? 'Adding…' : 'Add batch'}</button>
      </form>
    </>
  );
}
