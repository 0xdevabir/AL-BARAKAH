'use client';

import { canTransition, formatTk, ORDER_STATUSES, type OrderStatus } from '@albarakah/domain';
import {
  chooseAction, confirmAction, EmptyState, fmtRelative, fmtTime, fmtWhen, haptic, invalidate, LargeTitle, promptText,
  hasPoint, MapView, SearchField, Sheet, SkeletonList, statusLabel, statusTone, toast,
} from '@albarakah/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { OrderItemsEditor } from '@/components/OrderItemsEditor';
import { api, useGet } from '@/lib/api';
import { mapsLink, message, telLink } from '@/lib/app';
import { useLive } from '@/lib/live';
import type { AdminOrderDetail, AdminOrderRow, Counts, RiderOption } from '@/lib/types';

const FILTERS = [
  { value: 'ACTIVE', label: 'All open' },
  { value: 'late', label: 'Late' },
  { value: 'PLACED', label: 'New' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PACKED', label: 'Packed' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'OUT_FOR_DELIVERY', label: 'On the way' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

/** The obvious next step for each status, shown as the primary button. */
const PRIMARY: Partial<Record<OrderStatus, OrderStatus>> = { PLACED: 'CONFIRMED', CONFIRMED: 'PACKED', PACKED: 'ASSIGNED', FAILED: 'ASSIGNED' };
const VERB: Partial<Record<OrderStatus, string>> = { CONFIRMED: 'Confirm', PACKED: 'Mark packed', ASSIGNED: 'Assign rider', CANCELLED: 'Cancel order', FAILED: 'Mark failed' };

export default function OrdersPage() {
  return (
    <Suspense fallback={<SkeletonList rows={6} />}>
      <OrdersBoard />
    </Suspense>
  );
}

function OrdersBoard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filter = params.get('late') === '1' ? 'late' : (params.get('status') ?? 'ACTIVE');
  const openId = params.get('open');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim());
  const [emergency, setEmergency] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const qs = new URLSearchParams();
  if (filter === 'late') qs.set('late', '1');
  else qs.set('status', filter);
  if (dq) qs.set('q', dq);
  if (emergency) qs.set('type', 'EMERGENCY');
  qs.set('page', String(page));
  const { data: rows, pending, error } = useGet<AdminOrderRow[]>(`/admin/orders?${qs}`, { staleMs: 10_000 });
  const { data: counts } = useGet<Counts>('/admin/orders/counts');

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [filter, dq, emergency]);

  const live = useLive('/admin/orders/events/ticket', (e) => {
    invalidate('/admin/orders');
    invalidate('/admin/dashboard');
    if (e.status === 'PLACED') {
      haptic('success');
      toast('New order received', 'info', { label: 'Open', run: () => setParam('open', e.orderId) });
    }
  });

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (key === 'status') next.delete('late');
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  function setFilter(v: string) {
    const next = new URLSearchParams();
    if (v === 'late') next.set('late', '1');
    else if (v !== 'ACTIVE') next.set('status', v);
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }

  const badge = (v: string) => (v === 'late' ? counts?.late : v === 'ACTIVE' ? counts?.active : counts?.counts[v]);

  // Bulk: only offer a step that is valid for every selected order.
  const chosen = (rows ?? []).filter((r) => selected.has(r.id));
  const bulkTo = useMemo(() => {
    if (!chosen.length) return null;
    const to = PRIMARY[chosen[0]!.status];
    return to && to !== 'ASSIGNED' && chosen.every((r) => r.status === chosen[0]!.status) ? to : null;
  }, [chosen]);

  async function runBulk() {
    if (!bulkTo) return;
    if (!(await confirmAction({ title: `${VERB[bulkTo]} ${chosen.length} orders?`, confirm: VERB[bulkTo]! }))) return;
    const results = await Promise.allSettled(chosen.map((r) => api.patch(`/admin/orders/${r.id}/status`, { to: bulkTo })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    toast(failed ? `${chosen.length - failed} updated, ${failed} failed` : `${chosen.length} orders updated`, failed ? 'bad' : 'ok');
    setSelected(new Set());
    invalidate('/admin/orders');
  }

  return (
    <>
      <LargeTitle
        sub={
          <span className="row" style={{ gap: 8 }}>
            <span className={`live-dot${live ? ' on' : ''}`} /> {live ? 'Live' : 'Connecting…'} · {counts?.active ?? '–'} open
          </span>
        }
      >
        Orders
      </LargeTitle>

      <div className="toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Order code, phone or name" />
        <button className={`btn small${emergency ? ' primary' : ''}`} aria-pressed={emergency} onClick={() => setEmergency((v) => !v)}>
          <Icon name="bolt" size={16} /> Emergency
        </button>
      </div>

      <div className="hscroll" role="tablist" aria-label="Status" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => {
          const n = badge(f.value);
          return (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              className={`btn small${filter === f.value ? ' primary' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              {n ? <span className={`badge${f.value === 'late' ? '' : ' soft'}`}>{n}</span> : null}
            </button>
          );
        })}
      </div>

      {selected.size ? (
        <div className="notice ok row between" style={{ marginBottom: 12 }}>
          <span>{selected.size} selected</span>
          <span className="row" style={{ gap: 8 }}>
            <button className="btn small ghost" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button className="btn small primary" disabled={!bulkTo} onClick={() => void runBulk()}>
              {bulkTo ? VERB[bulkTo] : 'Mixed statuses'}
            </button>
          </span>
        </div>
      ) : null}

      {error && !rows ? <p className="error">{error.message}</p> : null}
      {pending ? <SkeletonList rows={6} /> : null}
      {rows && !rows.length ? (
        <EmptyState icon="✓" title={dq ? 'No matches' : 'Nothing here'}>
          {dq ? 'Try a different code, phone or name.' : filter === 'late' ? 'No order is running late.' : 'No orders in this view.'}
        </EmptyState>
      ) : null}

      {rows?.length ? (
        <div className="group cv stagger">
          {rows.map((o) => {
            const late = new Date(o.promisedBy).getTime() < Date.now() && !['DELIVERED', 'CANCELLED', 'FAILED'].includes(o.status);
            const bulkable = !!PRIMARY[o.status] && PRIMARY[o.status] !== 'ASSIGNED';
            return (
              <div key={o.id} className="order-row">
                {bulkable ? (
                  <input
                    type="checkbox"
                    aria-label={`Select ${o.code}`}
                    checked={selected.has(o.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(o.id);
                      else next.delete(o.id);
                      setSelected(next);
                    }}
                  />
                ) : (
                  <span className="check-gap" />
                )}
                <button className="order-open press" onClick={() => setParam('open', o.id)}>
                  <span className="cell-main">
                    <span className="row" style={{ gap: 8 }}>
                      <strong className="mono">{o.code}</strong>
                      {o.type === 'EMERGENCY' ? <span className="chip bad">Emergency</span> : null}
                      {o.consultationId ? <span className="chip ok" title="Covered by an e-prescription from a consultation here">e-Rx</span> : o.prescriptionKey ? <span className="chip warn">{o.items.length ? 'Rx' : 'Rx · to fill'}</span> : null}
                    </span>
                    <span className="cell-sub">
                      {o.customer.name} · {o.items.reduce((n, i) => n + i.qty, 0)} items · {o.addressSnapshot.zone ?? o.addressSnapshot.line}
                      {o.rider ? ` · ${o.rider.name}` : ''}
                    </span>
                  </span>
                  <span className="cell-end">
                    <span className={`chip ${statusTone(o.status)}`}>{statusLabel(o.status)}</span>
                    <span className={`small ${late ? 'late' : 'muted'}`}>
                      {late ? `Late ${fmtRelative(o.promisedBy).replace(' ago', '')}` : `By ${fmtTime(o.promisedBy)}`}
                    </span>
                    <span className="small price">{formatTk(o.totalPoisha)}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {rows && (page > 1 || rows.length >= 20) ? (
        <div className="row between" style={{ marginTop: 14 }}>
          <button className="btn small" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="muted small">Page {page}</span>
          <button className="btn small" disabled={rows.length < 20} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      ) : null}

      <Sheet open={!!openId} onClose={() => setParam('open', null)} title="Order">
        {openId ? <OrderDetail id={openId} onDone={() => setParam('open', null)} /> : null}
      </Sheet>
    </>
  );
}

function OrderDetail({ id, onDone }: { id: string; onDone: () => void }) {
  const { data: o, error, refetch } = useGet<AdminOrderDetail>(`/admin/orders/${id}`, { staleMs: 5_000 });
  const [busy, setBusy] = useState(false);

  if (error && !o) return <p className="error">{error.message}</p>;
  if (!o) return <SkeletonList rows={5} />;

  const order = o;
  const nexts = ORDER_STATUSES.filter((to) => canTransition(order.status, to, 'ADMIN'));
  const primary = PRIMARY[order.status] && nexts.includes(PRIMARY[order.status]!) ? PRIMARY[order.status]! : null;
  const secondary = nexts.filter((s) => s !== primary);
  const actor = (aid: string | null) => order.actors.find((a) => a.id === aid);
  const open = !['DELIVERED', 'CANCELLED', 'FAILED'].includes(order.status);
  const late = open && new Date(order.promisedBy).getTime() < Date.now();

  async function move(to: OrderStatus) {
    let riderId: string | undefined;
    let note: string | undefined;
    if (to === 'ASSIGNED') {
      const riders = await api.get<RiderOption[]>('/admin/riders').catch(() => [] as RiderOption[]);
      if (!riders.length) {
        toast('No active riders. Add one under Team.', 'bad');
        return;
      }
      const pick = await chooseAction(
        order.rider ? 'Reassign rider' : 'Assign a rider',
        riders.map((r) => ({ label: `${r.online ? '● ' : '○ '}${r.name} — ${r.activeJobs ? `${r.activeJobs} active` : 'free'}${r.online ? '' : ' (offline)'}`, value: r.id })),
        'Online riders with the fewest jobs are listed first.',
      );
      if (!pick) return;
      riderId = pick;
    } else if (to === 'CANCELLED' || to === 'FAILED') {
      const reason = await promptText({
        title: to === 'CANCELLED' ? `Cancel ${order.code}?` : `Mark ${order.code} failed?`,
        message: to === 'CANCELLED' ? 'Stock goes back to the shelf. The customer sees this reason.' : 'Say what went wrong.',
        placeholder: 'Reason',
        confirm: VERB[to] ?? "Save",
        required: true,
        destructive: true,
      });
      if (reason === null) return;
      note = reason;
    }
    setBusy(true);
    try {
      await api.patch(`/admin/orders/${order.id}/status`, { to, ...(riderId ? { riderId } : {}), ...(note ? { note } : {}) });
      toast(`${order.code}: ${statusLabel(to)}`);
      invalidate('/admin/orders');
      invalidate('/admin/dashboard');
      await refetch();
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function viewRx() {
    const tab = window.open('', '_blank');
    try {
      const { url } = await api.get<{ url: string }>(`/admin/orders/${order.id}/prescription`);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      toast(message(err), 'bad');
    }
  }

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <strong className="mono" style={{ fontSize: '1.3rem' }}>{order.code}</strong>
            {order.type === 'EMERGENCY' ? <span className="chip bad">Emergency</span> : null}
          </div>
          <span className={`small ${late ? 'late' : 'muted'}`}>
            {open ? `${late ? 'Late — was due' : 'Due'} ${fmtWhen(order.promisedBy)}` : `Placed ${fmtWhen(order.createdAt)}`}
          </span>
        </div>
        <span className={`chip ${statusTone(order.status)}`}>{statusLabel(order.status)}</span>
      </div>

      {nexts.length ? (
        <div className="actions">
          {primary ? (
            <button className="btn primary" disabled={busy} onClick={() => void move(primary)}>
              {primary === 'ASSIGNED' && order.rider ? 'Reassign rider' : VERB[primary] ?? statusLabel(primary)}
            </button>
          ) : null}
          {secondary.map((s) => (
            <button key={s} className={`btn${s === 'CANCELLED' || s === 'FAILED' ? ' danger' : ''}`} disabled={busy} onClick={() => void move(s)}>
              {s === 'ASSIGNED' ? (order.rider ? 'Reassign rider' : 'Assign rider') : VERB[s] ?? statusLabel(s)}
            </button>
          ))}
        </div>
      ) : null}

      {hasPoint(order.addressSnapshot) ? (
        <a className="order-map" href={mapsLink(order.addressSnapshot.line, order.addressSnapshot)} target="_blank" rel="noreferrer" aria-label="Open the delivery pin in Google Maps">
          <MapView still recenter={false} zoom={15} center={{ lat: order.addressSnapshot.lat!, lng: order.addressSnapshot.lng! }} pins={[{ id: "home", kind: "home", point: { lat: order.addressSnapshot.lat!, lng: order.addressSnapshot.lng! } }]} style={{ height: 150 }} />
        </a>
      ) : null}

      <p className="group-label">Customer</p>
      <div className="group">
        <div>
          <span className="avatar">{order.customer.name.slice(0, 1)}</span>
          <span className="cell-main">
            <strong>{order.customer.name}</strong>
            <span className="cell-sub">
              {order.customer._count.orders} orders · since {new Date(order.customer.createdAt).getFullYear()}
            </span>
          </span>
          <a className="btn small" href={telLink(order.addressSnapshot.phone ?? order.customer.phone)} aria-label="Call customer">
            <Icon name="phone" size={18} />
          </a>
        </div>
        <a href={mapsLink(order.addressSnapshot.line, order.addressSnapshot)} target="_blank" rel="noreferrer" className="chev">
          <span className="cell-icon"><Icon name="map" size={18} /></span>
          <span className="cell-main">
            <strong>{order.addressSnapshot.label ?? 'Address'}{order.addressSnapshot.zone ? ` · ${order.addressSnapshot.zone}` : ''}</strong>
            <span className="cell-sub">{order.addressSnapshot.line}</span>
            {order.addressSnapshot.notes ? <span className="cell-sub">“{order.addressSnapshot.notes}”</span> : null}
          </span>
        </a>
        {order.rider ? (
          <a href={telLink(order.rider.phone)}>
            <span className="cell-icon live"><Icon name="bike" size={18} /></span>
            <span className="cell-main">
              <strong>{order.rider.name}</strong>
              <span className="cell-sub">Rider · tap to call</span>
            </span>
          </a>
        ) : null}
        {order.notes ? (
          <div>
            <span className="cell-icon warn">“</span>
            <span className="cell-main"><span className="cell-sub">{order.notes}</span></span>
          </div>
        ) : null}
      </div>

      <p className="group-label">Items</p>
      <div className="panel">
        {order.items.map((i) => (
          <div key={i.id} className="line-item">
            <span>
              {i.qty} × {i.nameSnapshot}
              {i.allocations.length ? (
                <span className="cell-sub mono small" style={{ display: 'block' }}>
                  {i.allocations.map((a) => `#${a.batch.batchNo} ×${a.qty}`).join(' · ')}
                </span>
              ) : null}
            </span>
            <span className="mono">{formatTk(i.unitPricePoisha * i.qty)}</span>
          </div>
        ))}
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>Subtotal</dt><dd>{formatTk(order.subtotalPoisha)}</dd>
          <dt>Delivery</dt><dd>{formatTk(order.deliveryFeePoisha)}</dd>
          {order.emergencyFeePoisha ? (<><dt>Emergency</dt><dd>{formatTk(order.emergencyFeePoisha)}</dd></>) : null}
          <dt>Total</dt><dd className="price">{formatTk(order.totalPoisha)}</dd>
          <dt>Payment</dt><dd>{order.paymentMethod === 'COD' ? 'Cash on delivery' : 'bKash'} · {statusLabel(order.paymentStatus)}</dd>
          <dt>Rider payout</dt><dd>{formatTk(order.riderPayoutPoisha)}</dd>
        </dl>
        {order.prescriptionKey ? (
          <button className="btn block" style={{ marginTop: 12 }} onClick={() => void viewRx()}>
            <Icon name="doc" size={18} /> View prescription
          </button>
        ) : null}
      </div>

      {order.prescriptionKey && order.status === 'PLACED' && order.paymentStatus !== 'PAID' ? (
        <>
          <p className="group-label">{order.items.length ? 'Change items from the prescription' : 'Fill this order from the prescription'}</p>
          <OrderItemsEditor orderId={order.id} hasItems={order.items.length > 0} onSaved={() => void refetch()} />
        </>
      ) : null}

      {order.consultation?.prescription ? (
        <>
          <p className="group-label">E-prescription</p>
          <div className="panel stack" style={{ gap: 8 }}>
            <div className="row between" style={{ gap: 8 }}>
              <span>
                <strong>{order.consultation.doctor.user.name}</strong>
                <span className="muted small" style={{ display: 'block' }}>
                  {order.consultation.doctor.specialty} · BMDC {order.consultation.doctor.bmdcNo}
                </span>
              </span>
              <span className="chip ok mono">{order.consultation.code}</span>
            </div>
            <span className="muted small">Written {fmtWhen(order.consultation.prescribedAt ?? order.consultation.startsAt)}</span>
            {order.consultation.prescription.diagnosis ? <span className="small">Diagnosis: <strong>{order.consultation.prescription.diagnosis}</strong></span> : null}
            <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {order.consultation.prescription.items.map((i, n) => (
                <li key={n}>
                  <strong>{i.medicine}</strong> {i.dose} — {[i.frequency, i.days ? `${i.days} days` : ''].filter(Boolean).join(' × ')}
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : null}

      {order.rating ? (
        <>
          <p className="group-label">Customer rating</p>
          <div className="panel">
            <strong>{'★'.repeat(order.rating)}{'☆'.repeat(5 - order.rating)}</strong>
            {order.feedback ? <p className="muted small" style={{ marginTop: 6 }}>{order.feedback}</p> : null}
          </div>
        </>
      ) : null}

      <p className="group-label">Timeline</p>
      <div className="panel">
        <ul className="timeline">
          {order.events.map((e) => {
            const a = actor(e.actorId);
            return (
              <li key={e.id}>
                <span>
                  <strong>{statusLabel(e.toStatus)}</strong>
                  <span className="muted"> · {fmtWhen(e.createdAt)}{a ? ` · ${a.name}` : ''}</span>
                  {e.note ? <span className="cell-sub" style={{ display: 'block' }}>{e.note}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <button className="btn ghost" onClick={onDone}>Done</button>
    </div>
  );
}
