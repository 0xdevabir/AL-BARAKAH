'use client';

import { formatTk } from '@albarakah/domain';
import { clearQueries, confirmAction, EmptyState, haptic, initials, invalidate, Sheet, SkeletonList, toast } from '@albarakah/ui';
import Link from 'next/link';
import { useState } from 'react';
import { BrandLockup } from '@/components/BrandLockup';
import { useApi, useGet } from '@/lib/api';

interface Zone { id: string; name: string; deliveryFeePoisha: number }
interface Address { id: string; label: string; line: string; phone: string; notes?: string | null; zone: Zone }

export default function AccountPage() {
  const { api, user, ready } = useApi();
  const { data: addresses, pending } = useGet<Address[]>(user ? '/addresses' : null);
  const { data: active } = useGet<{ id: string }[]>(user ? '/orders?scope=active&page=1' : null);
  const [adding, setAdding] = useState(false);

  if (!ready) {
    return (
      <div className="page stack">
        <BrandLockup />
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page stack" style={{ paddingTop: 48 }}>
        <BrandLockup size={30} />
        <h1 className="title">Your account</h1>
        <p className="muted">Sign in to track orders, save addresses and book doctors.</p>
        <Link className="btn primary block" href="/login?next=/account">Sign in</Link>
      </div>
    );
  }

  async function remove(a: Address) {
    if (!(await confirmAction({ title: `Delete “${a.label}”?`, message: a.line, confirm: 'Delete', destructive: true }))) return;
    try {
      await api.del(`/addresses/${a.id}`);
      haptic('light');
      toast('Address deleted');
      invalidate('/addresses');
    } catch (err) {
      toast((err as Error).message, 'bad');
    }
  }

  return (
    <div className="page stack screen" style={{ paddingTop: 28 }}>
      <div className="row" style={{ gap: 14 }}>
        <span className="avatar lg">{initials(user.name)}</span>
        <span className="grow">
          <h1 className="title" style={{ margin: 0 }}>{user.name}</h1>
          <span className="muted mono">{user.phone}</span>
        </span>
      </div>

      <div className="group">
        <Link href="/orders" className="chev">
          <span className="grow">Orders</span>
          {active?.length ? <span className="badge">{active.length}</span> : null}
        </Link>
        <Link href="/doctors/bookings" className="chev"><span className="grow">Consultations &amp; prescriptions</span></Link>
        <Link href="/doctors" className="chev"><span className="grow">Book a doctor</span></Link>
      </div>

      <p className="group-label">Saved addresses</p>
      {pending ? <SkeletonList rows={2} /> : null}
      {addresses && !addresses.length ? <EmptyState icon="🏠" title="No saved addresses">Add one now to check out faster.</EmptyState> : null}
      {addresses?.length ? (
        <div className="group">
          {addresses.map((a) => (
            <div key={a.id}>
              <span className="cell-main">
                <strong>{a.label}</strong>
                <span className="cell-sub">{a.line}</span>
                <span className="cell-sub">{a.zone.name} · delivery {formatTk(a.zone.deliveryFeePoisha)} · {a.phone}</span>
              </span>
              <button className="btn small ghost" aria-label={`Delete ${a.label}`} onClick={() => void remove(a)}>Delete</button>
            </div>
          ))}
        </div>
      ) : null}
      <button className="btn block" onClick={() => setAdding(true)}>+ Add address</button>

      <button
        className="btn danger block"
        style={{ marginTop: 16 }}
        onClick={async () => {
          if (!(await confirmAction({ title: 'Sign out?', confirm: 'Sign out', destructive: true }))) return;
          await api.logout();
          clearQueries();
        }}
      >
        Sign out
      </button>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add address">
        <AddressForm defaultPhone={user.phone} onSaved={() => setAdding(false)} />
      </Sheet>
    </div>
  );
}

function AddressForm({ defaultPhone, onSaved }: { defaultPhone: string; onSaved: () => void }) {
  const { api } = useApi();
  const { data: zones } = useGet<Zone[]>('/zones', { staleMs: 300_000 });
  const [d, setD] = useState({ label: 'Home', line: '', zoneId: '', phone: defaultPhone, notes: '' });
  const [busy, setBusy] = useState(false);
  const zoneId = d.zoneId || zones?.[0]?.id || '';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/addresses', { label: d.label.trim(), line: d.line.trim(), zoneId, phone: d.phone.trim(), ...(d.notes.trim() ? { notes: d.notes.trim() } : {}) });
      haptic('success');
      toast('Address saved');
      invalidate('/addresses');
      onSaved();
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void save(e)}>
      <div className="row wrap" style={{ gap: 8 }}>
        {['Home', 'Office', 'Parents'].map((l) => (
          <button key={l} type="button" className={`chip${d.label === l ? ' live' : ''}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setD({ ...d, label: l })}>{l}</button>
        ))}
      </div>
      <label className="field">
        <span>Label</span>
        <input className="input" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} required maxLength={40} />
      </label>
      <label className="field">
        <span>Address</span>
        <textarea className="input" value={d.line} placeholder="House, road, area" onChange={(e) => setD({ ...d, line: e.target.value })} required minLength={3} maxLength={200} />
      </label>
      <label className="field">
        <span>Zone</span>
        <select className="input" value={zoneId} onChange={(e) => setD({ ...d, zoneId: e.target.value })} required>
          {zones?.map((z) => <option key={z.id} value={z.id}>{z.name} ({formatTk(z.deliveryFeePoisha)})</option>)}
        </select>
      </label>
      <label className="field">
        <span>Phone for the rider</span>
        <input className="input" type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} required />
      </label>
      <label className="field">
        <span>Directions <span className="muted small">(optional)</span></span>
        <input className="input" value={d.notes} placeholder="Gate colour, landmark, floor" maxLength={200} onChange={(e) => setD({ ...d, notes: e.target.value })} />
      </label>
      <button className="btn primary block" disabled={busy || !zoneId}>{busy ? 'Saving…' : 'Save address'}</button>
    </form>
  );
}
