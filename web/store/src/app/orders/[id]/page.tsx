'use client';

import { formatTk } from '@albarakah/domain';
import { fmtWhen, fmtWindow } from '@albarakah/ui';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Order {
  id: string;
  code: string;
  status: string;
  type: string;
  promisedBy: string;
  slotStart: string | null;
  slotEnd: string | null;
  subtotalPoisha: number;
  deliveryFeePoisha: number;
  emergencyFeePoisha: number;
  totalPoisha: number;
  paymentMethod: 'COD' | 'BKASH';
  paymentStatus: string;
  addressSnapshot: { label: string; line: string };
  items: { id: string; nameSnapshot: string; qty: number; unitPricePoisha: number }[];
  events: { id: string; toStatus: string; createdAt: string }[];
  rider: { name: string; phone: string } | null;
}

function OrderInner() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const payment = search.get('payment');
  const placed = search.has('placed');
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const active = !!order && !['DELIVERED', 'CANCELLED', 'FAILED'].includes(order.status);
  const left = order ? new Date(order.promisedBy).getTime() - now : 0;
  const s = Math.max(0, Math.floor(left / 1000));
  const countdown = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  async function load() {
    try {
      setOrder(await api.get<Order>(`/orders/${id}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    let closed = false;
    let stream: EventSource | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function listen() {
      if (closed) return;
      try {
        const { ticket } = await api.post<{ ticket: string }>(`/orders/${id}/events/ticket`);
        stream = new EventSource(`${api.base}/orders/events/stream?ticket=${encodeURIComponent(ticket)}`);
        stream.onmessage = () => void load();
        stream.onerror = () => {
          stream?.close();
          if (!closed) setTimeout(() => void load().then(listen), 5000);
        };
      } catch {
        if (!closed) setTimeout(listen, 15_000);
      }
    }

    void (async () => {
      if (!api.ready) await api.restore();
      if (!api.user) {
        router.replace(`/login?next=/orders/${id}`);
        return;
      }
      await load();
      timer = setInterval(() => setNow(Date.now()), 1000);
      void listen();
    })();

    return () => {
      closed = true;
      stream?.close();
      if (timer) clearInterval(timer);
    };
  }, [id, router]);

  async function cancel() {
    setBusy(true);
    try {
      await api.post(`/orders/${id}/cancel`);
      await load();
    } catch (err) {
      setError((err as Error).message);
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
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack">
      <Link className="btn ghost small" href="/orders" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>
        ‹ Orders
      </Link>
      {placed ? <p className="notice ok" role="status">Order placed.</p> : null}
      {payment === 'success' ? <p className="notice ok" role="status">Payment received.</p> : null}
      {payment === 'failed' ? <p className="notice bad" role="alert">Payment failed. You can try again.</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      {order ? (
        <>
          <div>
            <h1 className="title">{order.status}</h1>
            <p className="mono small muted">{order.code}</p>
          </div>
          {active && order.type === 'EMERGENCY' ? (
            <div className="card">
              <span className="muted small">Arriving in</span>
              <strong className="mono" style={{ fontSize: '2rem' }}>{countdown}</strong>
            </div>
          ) : null}
          <div className="card">{order.slotStart ? fmtWindow(order.slotStart, order.slotEnd!) : fmtWhen(order.promisedBy)}</div>
          <div className="group">
            {order.items.map((i) => (
              <div key={i.id} className="row between">
                <span>{i.nameSnapshot} × {i.qty}</span>
                <span className="price">{formatTk(i.unitPricePoisha * i.qty)}</span>
              </div>
            ))}
            <div className="row between"><span>Delivery</span><span className="price">{formatTk(order.deliveryFeePoisha)}</span></div>
            {order.emergencyFeePoisha ? <div className="row between"><span>Emergency</span><span className="price">{formatTk(order.emergencyFeePoisha)}</span></div> : null}
            <div className="row between"><strong>Total</strong><strong className="price">{formatTk(order.totalPoisha)}</strong></div>
          </div>
          <div className="card">
            <strong>{order.addressSnapshot.label}</strong>
            <p className="muted">{order.addressSnapshot.line}</p>
          </div>
          {order.rider ? (
            <div className="card">
              <strong>{order.rider.name}</strong>
              <a className="muted" href={`tel:${order.rider.phone}`}>{order.rider.phone}</a>
            </div>
          ) : null}
          <ul className="timeline">
            {order.events.map((e, i) => (
              <li key={e.id}>
                <span className={`dot${i === order.events.length - 1 ? ' now' : ''}`} />
                <span className="grow">{e.toStatus}</span>
                <span className="muted small">{fmtWhen(e.createdAt)}</span>
              </li>
            ))}
          </ul>
          {active && order.paymentMethod === 'BKASH' && order.paymentStatus !== 'PAID' ? (
            <button className="btn primary block" type="button" disabled={busy} onClick={() => void pay()}>
              Pay with bKash
            </button>
          ) : null}
          {active && order.status === 'PLACED' ? (
            <button className="btn danger block" type="button" disabled={busy} onClick={() => void cancel()}>
              Cancel order
            </button>
          ) : null}
        </>
      ) : !error ? (
        <p className="muted">Loading…</p>
      ) : null}
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<div className="page muted">Loading…</div>}>
      <OrderInner />
    </Suspense>
  );
}
