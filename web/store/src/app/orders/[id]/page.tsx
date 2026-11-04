'use client';

import { formatTk } from '@albarakah/domain';
import { confirmAction, fmtTime, fmtWhen, fmtWindow, haptic, invalidate, ORDER_STEPS, Skeleton, statusLabel, statusTone, toast } from '@albarakah/ui';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, useGet } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { useLive } from '@/lib/live';
import { reorder } from '@/lib/reorder';
import { LiveTrack } from '@/components/LiveTrack';

interface Order {
  id: string; code: string; status: string; type: string; promisedBy: string; slotStart: string | null; slotEnd: string | null;
  subtotalPoisha: number; deliveryFeePoisha: number; emergencyFeePoisha: number; totalPoisha: number;
  paymentMethod: 'COD' | 'BKASH'; paymentStatus: string; deliveredAt: string | null; rating: number | null; feedback: string | null;
  handoverCode: string | null; notes: string | null;
  addressSnapshot: { label: string; line: string; phone?: string; lat?: number | null; lng?: number | null };
  items: { id: string; nameSnapshot: string; qty: number; unitPricePoisha: number; medicine: { slug: string; imageUrl: string } | null }[];
  events: { id: string; toStatus: string; createdAt: string; note?: string | null }[];
  rider: { name: string; phone: string } | null;
}

const ENDED = ['DELIVERED', 'CANCELLED', 'FAILED'];
const STEP_COPY: Record<string, string> = {
  PLACED: 'We have your order',
  CONFIRMED: 'Pharmacist checked it',
  PACKED: 'Packed and sealed',
  ASSIGNED: 'A rider is picking it up',
  OUT_FOR_DELIVERY: 'On the way to you',
  DELIVERED: 'Delivered',
};

function OrderInner() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const user = useSignedIn(`/orders/${id}`);
  const path = user ? `/orders/${id}` : null;
  const { data: order, error } = useGet<Order>(path);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const active = !!order && !ENDED.includes(order.status);
  useLive(user && active ? `/orders/${id}/events/ticket` : null, (e) => {
    invalidate(`/orders/${id}`);
    invalidate(`/orders/${id}/track`);
    invalidate('/orders?');
    haptic(e.status === 'DELIVERED' ? 'success' : 'light');
    toast(statusLabel(e.status), e.status === 'FAILED' || e.status === 'CANCELLED' ? 'bad' : 'info');
  });

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // Show the payment result once, then drop it from the URL so a refresh does not repeat it.
  useEffect(() => {
    const p = search.get('payment');
    if (p === 'success') toast('Payment received');
    if (p === 'failed') toast('Payment failed. You can try again.', 'bad');
    if (search.has('placed')) {
      haptic('success');
      toast('Order placed');
    }
    if (p || search.has('placed')) router.replace(`/orders/${id}`, { scroll: false });
  }, [search, router, id]);

  async function cancel() {
    if (!(await confirmAction({ title: 'Cancel this order?', message: 'You can only cancel before the pharmacist confirms it.', confirm: 'Cancel order', destructive: true }))) return;
    setBusy(true);
    try {
      await api.post(`/orders/${id}/cancel`);
      toast('Order cancelled');
      invalidate(`/orders`);
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    setBusy(true);
    try {
      const { redirectUrl } = await api.post<{ redirectUrl: string }>('/payments/start', { purpose: 'ORDER', refId: id });
      location.href = redirectUrl;
    } catch (err) {
      toast((err as Error).message, 'bad');
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="page empty stack">
        <p>{error.message}</p>
        <Link className="btn" href="/orders">Back to orders</Link>
      </div>
    );
  }
  if (!order) return <OrderSkeleton />;

  const left = new Date(order.promisedBy).getTime() - now;
  const s = Math.max(0, Math.floor(left / 1000));
  const countdown = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const stepIndex = ORDER_STEPS.indexOf(order.status as (typeof ORDER_STEPS)[number]);
  const at = (st: string) => [...order.events].reverse().find((e) => e.toStatus === st)?.createdAt;
  const lastNote = [...order.events].reverse().find((e) => e.note)?.note;

  return (
    <div className="page stack screen">
      <Link className="btn small back glass" href="/orders">‹ Orders</Link>

      <div>
        <span className={`chip ${statusTone(order.status)}`}>{statusLabel(order.status)}</span>
        <h1 className="title" style={{ marginTop: 8 }}>
          {order.status === 'DELIVERED' ? 'Delivered' : order.status === 'CANCELLED' ? 'Cancelled' : order.status === 'FAILED' ? 'We could not deliver' : (STEP_COPY[order.status] ?? statusLabel(order.status))}
        </h1>
        <p className="mono small muted">{order.code} · {order.type === 'EMERGENCY' ? 'Emergency' : 'Scheduled'}</p>
      </div>

      {order.status === 'FAILED' && lastNote ? <p className="notice bad">{lastNote}</p> : null}

      {active ? (
        <div className="card">
          {order.type === 'EMERGENCY' ? (
            <>
              <span className="muted small">{left > 0 ? 'Arriving in' : 'Arriving any minute'}</span>
              <strong className="mono" style={{ fontSize: '2.2rem' }}>{left > 0 ? countdown : '00:00'}</strong>
            </>
          ) : (
            <>
              <span className="muted small">Arriving</span>
              <strong>{order.slotStart && order.slotEnd ? fmtWindow(order.slotStart, order.slotEnd) : fmtWhen(order.promisedBy)}</strong>
            </>
          )}
        </div>
      ) : null}

      {['ASSIGNED', 'OUT_FOR_DELIVERY'].includes(order.status) ? <LiveTrack orderId={order.id} status={order.status} /> : null}

      {order.handoverCode ? (
        <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="muted small">Give this code to the rider</span>
          <div className="codebox" aria-label={`Handover code ${order.handoverCode.split('').join(' ')}`}>
            {order.handoverCode.split('').map((c, i) => <span key={i}>{c}</span>)}
          </div>
          <span className="muted small">Only share it once the medicines are in your hand.</span>
        </div>
      ) : null}

      {order.rider ? (
        <div className="card row between">
          <span>
            <span className="muted small">Your rider</span>
            <strong style={{ display: 'block' }}>{order.rider.name}</strong>
          </span>
          <a className="btn primary small" href={`tel:${order.rider.phone}`}>Call</a>
        </div>
      ) : null}

      {order.status !== 'CANCELLED' ? (
        <div className="card">
          <div className="track">
            {ORDER_STEPS.map((st, i) => {
              const done = stepIndex > i || order.status === 'DELIVERED';
              const now = stepIndex === i && active;
              const when = at(st);
              return (
                <div key={st} className={`track-step${done ? ' done' : ''}${now ? ' now' : ''}`}>
                  <span className="track-dot" />
                  <span className="track-text">
                    <strong>{STEP_COPY[st]}</strong>
                    {when ? <span className="muted small">{fmtTime(when)}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {order.status === 'DELIVERED' ? <Rate order={order} /> : null}

      <div className="group">
        {order.items.map((i) => (
          <Link key={i.id} href={i.medicine ? `/medicine/${i.medicine.slug}` : '#'} className="row between">
            <span>{i.nameSnapshot} × {i.qty}</span>
            <span className="price">{formatTk(i.unitPricePoisha * i.qty)}</span>
          </Link>
        ))}
        <div className="row between"><span className="muted">Subtotal</span><span className="price">{formatTk(order.subtotalPoisha)}</span></div>
        <div className="row between"><span className="muted">Delivery</span><span className="price">{formatTk(order.deliveryFeePoisha)}</span></div>
        {order.emergencyFeePoisha ? <div className="row between"><span className="muted">Emergency</span><span className="price">{formatTk(order.emergencyFeePoisha)}</span></div> : null}
        <div className="row between"><strong>Total</strong><strong className="price">{formatTk(order.totalPoisha)}</strong></div>
        <div className="row between">
          <span className="muted">Payment</span>
          <span>{order.paymentMethod === 'COD' ? 'Cash on delivery' : 'bKash'} · {statusLabel(order.paymentStatus)}</span>
        </div>
      </div>

      <div className="card">
        <strong>{order.addressSnapshot.label}</strong>
        <p className="muted">{order.addressSnapshot.line}</p>
      </div>

      {active && order.paymentMethod === 'BKASH' && order.paymentStatus !== 'PAID' ? (
        <button className="btn primary block" type="button" disabled={busy} onClick={() => void pay()}>Pay {formatTk(order.totalPoisha)} with bKash</button>
      ) : null}
      {!active ? (
        <button
          className="btn primary block"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (await reorder(order.id)) router.push('/cart');
            setBusy(false);
          }}
        >
          Order again
        </button>
      ) : null}
      {order.status === 'PLACED' ? (
        <button className="btn danger block" type="button" disabled={busy} onClick={() => void cancel()}>Cancel order</button>
      ) : null}
    </div>
  );
}

function Rate({ order }: { order: Order }) {
  const [stars, setStars] = useState(order.rating ?? 0);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const done = order.rating !== null;

  async function send() {
    setBusy(true);
    try {
      await api.post(`/orders/${order.id}/rate`, { rating: stars, ...(feedback.trim() ? { feedback: feedback.trim() } : {}) });
      haptic('success');
      toast('Thanks for your rating');
      invalidate(`/orders/${order.id}`);
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <strong>{done ? 'Your rating' : 'How was your delivery?'}</strong>
      <div className="stars" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={n <= stars ? 'on' : undefined}
            disabled={done}
            onClick={() => {
              haptic('light');
              setStars(n);
            }}
          >
            ★
          </button>
        ))}
      </div>
      {done ? (
        order.feedback ? <p className="muted">“{order.feedback}”</p> : null
      ) : stars ? (
        <>
          <textarea className="input" rows={2} maxLength={500} placeholder={stars < 4 ? 'What went wrong?' : 'Anything to add? (optional)'} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <button className="btn primary block" disabled={busy} onClick={() => void send()}>Send</button>
        </>
      ) : null}
    </div>
  );
}

function OrderSkeleton() {
  return (
    <div className="page stack" aria-busy="true">
      <Skeleton h={22} w={90} />
      <Skeleton h={40} w="70%" />
      <Skeleton h={90} r={18} />
      <Skeleton h={220} r={18} />
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<OrderSkeleton />}>
      <OrderInner />
    </Suspense>
  );
}
