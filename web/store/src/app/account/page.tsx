'use client';

import { formatTk } from '@albarakah/domain';
import { clearQueries, confirmAction, EmptyState, haptic, hasPoint, initials, invalidate, MapView, Sheet, SkeletonList, toast } from '@albarakah/ui';
import Link from 'next/link';
import { useState } from 'react';
import { type Address, AddressComposer } from '@/components/AddressComposer';
import { BrandLockup } from '@/components/BrandLockup';
import { useApi, useGet } from '@/lib/api';


export default function AccountPage() {
  const { api, user, ready } = useApi();
  const { data: addresses, pending } = useGet<Address[]>(user ? '/addresses' : null);
  const { data: active } = useGet<{ id: string }[]>(user ? '/orders?scope=active&page=1' : null);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);

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
        <div className="addr-list">
          {addresses.map((a) => (
            <article key={a.id} className="addr-card">
              {hasPoint(a) ? (
                <MapView still recenter={false} zoom={15.5} center={{ lat: a.lat!, lng: a.lng! }} pins={[{ id: 'home', kind: 'home', point: { lat: a.lat!, lng: a.lng! } }]} style={{ height: 110, borderRadius: 0 }} />
              ) : (
                <button type="button" className="addr-nopin" onClick={() => setEditing(a)}>📍 Add a map pin so riders find you faster</button>
              )}
              <div className="addr-body">
                <span className="grow" style={{ minWidth: 0 }}>
                  <strong>{a.label}</strong>
                  <span className="cell-sub" style={{ display: 'block' }}>{a.line}</span>
                  <span className="cell-sub" style={{ display: 'block' }}>{a.zone.name} · delivery {formatTk(a.zone.deliveryFeePoisha)} · {a.phone}</span>
                </span>
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn small ghost" aria-label={`Edit ${a.label}`} onClick={() => setEditing(a)}>Edit</button>
                  <button className="btn small ghost danger" aria-label={`Delete ${a.label}`} onClick={() => void remove(a)}>Delete</button>
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <button className="btn block" onClick={() => setEditing('new')}>+ Add address</button>

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

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing && editing !== 'new' ? `Edit “${editing.label}”` : 'New address'}>
        {editing ? (
          <AddressComposer key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} defaultPhone={user.phone} onSaved={() => setEditing(null)} />
        ) : null}
      </Sheet>
    </div>
  );
}
