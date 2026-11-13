'use client';

import { formatTk } from '@albarakah/domain';
import { fmtWindow, haptic, Sheet } from '@albarakah/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Address } from '@/components/AddressComposer';
import { api } from '@/lib/api';
import { useCart } from '@/lib/useCart';

interface Slot { start: string; end: string }

/**
 * One tap to reorder with the usual choices: the first saved address, the earliest slot and cash on delivery.
 * Anything unusual (no address yet, an Rx medicine without a prescription) goes through the full checkout instead.
 */
export function QuickOrder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { cart, lines, subtotal, rx } = useCart();
  const [address, setAddress] = useState<Address>();
  const [slot, setSlot] = useState<Slot>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const covered = lines.filter((l) => l.isRx).every((l) => rx?.medicineIds.includes(l.id));

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    setError('');
    void (async () => {
      if (!api.ready) await api.restore();
      if (!api.user) return router.push('/login?next=/cart');
      try {
        const [a, s] = await Promise.all([
          api.get<Address[]>('/addresses'),
          api.get<{ slots: Slot[] }>(`/delivery-slots?ids=${lines.map((l) => l.id).join(',')}`),
        ]);
        setAddress(a[0]);
        setSlot(s.slots[0]);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the sheet opens
  }, [open]);

  async function place() {
    if (!address || !slot) return;
    setBusy(true);
    setError('');
    try {
      const order = await api.post<{ id: string }>('/orders', {
        idempotencyKey,
        addressId: address.id,
        type: 'NORMAL',
        paymentMethod: 'COD',
        slotStart: slot.start,
        ...(rx && lines.some((l) => rx.medicineIds.includes(l.id)) ? { consultationId: rx.consultationId } : {}),
        items: lines.map((l) => ({ medicineId: l.id, qty: l.qty, unit: l.unit ?? 'PACK' })),
      });
      haptic('success');
      cart.clear();
      router.replace(`/orders/${order.id}?placed=1`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fee = address?.zone.deliveryFeePoisha ?? 0;
  const ready = loaded && address && slot && covered;

  return (
    <Sheet open={open} onClose={onClose} title="Quick order">
      {!loaded ? (
        <p className="muted">Getting your usual details…</p>
      ) : !ready ? (
        <div className="stack">
          <p>
            {error
              ? error
              : !covered
              ? 'Your cart has prescription medicines, so please add the prescription at checkout.'
              : !address
                ? 'Save a delivery address once and quick order will use it next time.'
                : 'No delivery windows are open right now.'}
          </p>
          <Link className="btn primary block" href="/checkout">Go to checkout</Link>
        </div>
      ) : (
        <div className="stack">
          <div className="group">
            <div className="row between"><span className="muted">Deliver to</span><strong>{address.label}</strong></div>
            <div className="row between"><span className="muted">Arrives</span><strong>{fmtWindow(slot.start, slot.end)}</strong></div>
            <div className="row between"><span className="muted">Payment</span><strong>Cash on delivery</strong></div>
            <div className="row between"><span className="muted">{lines.length} item{lines.length === 1 ? '' : 's'} + delivery</span><strong className="price">{formatTk(subtotal + fee)}</strong></div>
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="btn primary block" type="button" disabled={busy} onClick={() => void place()}>
            {busy ? 'Placing…' : `Place order · ${formatTk(subtotal + fee)}`}
          </button>
          <Link className="btn ghost block" href="/checkout">Change details</Link>
        </div>
      )}
    </Sheet>
  );
}
