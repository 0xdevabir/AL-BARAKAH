'use client';

import { formatTk } from '@albarakah/domain';
import { fmtShortDay, fmtTime, fmtWeekday, fmtWindow, hasPoint, MapView, Segmented, Sheet } from '@albarakah/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useCart } from '@/lib/useCart';
import { type Address, AddressComposer } from '@/components/AddressComposer';

interface Slot { start: string; end: string }

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' });
const dayKey = (d: string | Date) => dayKeyFmt.format(new Date(d));

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, lines, subtotal, rx } = useCart();
  // Rx medicines in the cart that the linked e-prescription does not cover still need an upload.
  const rxLines = lines.filter((l) => l.isRx);
  const covered = rxLines.filter((l) => rx?.medicineIds.includes(l.id));
  const needsUpload = rxLines.length > covered.length;
  const [step, setStep] = useState(0);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [emergency, setEmergency] = useState({ available: false, feePoisha: 0, minutes: 60 });
  const [addressId, setAddressId] = useState('');
  const [type, setType] = useState<'NORMAL' | 'EMERGENCY'>('NORMAL');
  const [slotStart, setSlotStart] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'BKASH'>('COD');
  const [notes, setNotes] = useState('');
  const [prescriptionKey, setPrescriptionKey] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [ready, setReady] = useState(false);
  const [day, setDay] = useState('');

  const days = useMemo(() => {
    const today = dayKey(new Date());
    const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
    const byDay = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = dayKey(s.start);
      byDay.set(k, [...(byDay.get(k) ?? []), s]);
    }
    return [...byDay].map(([key, list]) => ({
      key,
      slots: list,
      label: key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : fmtWeekday(list[0]!.start),
    }));
  }, [slots]);
  const activeDay = day || (slotStart ? dayKey(slotStart) : (days[0]?.key ?? ''));
  const daySlots = days.find((d) => d.key === activeDay)?.slots ?? [];
  const chosen = slots.find((s) => s.start === slotStart);

  const address = addresses.find((a) => a.id === addressId);
  const deliveryFee = address?.zone.deliveryFeePoisha ?? 0;
  const emergencyFee = type === 'EMERGENCY' ? emergency.feePoisha : 0;
  const total = subtotal + deliveryFee + emergencyFee;
  const canNext = step === 0 ? !!addressId : type === 'EMERGENCY' ? emergency.available : !!slotStart;

  useEffect(() => {
    void (async () => {
      if (!api.ready) await api.restore();
      if (!api.user) {
        router.replace('/login?next=/checkout');
        return;
      }
      if (lines.length === 0) {
        router.replace('/cart');
        return;
      }
      try {
        const [a, s] = await Promise.all([
          api.get<Address[]>('/addresses'),
          api.get<{ slots: Slot[]; emergency: typeof emergency }>('/delivery-slots'),
        ]);
        setAddresses(a);
        setSlots(s.slots);
        setEmergency(s.emergency);
        setAddressId(a[0]?.id ?? '');
        setSlotStart(s.slots[0]?.start ?? '');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setReady(true);
      }
    })();
  }, [lines.length, router]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    if (file.size > 8 * 1024 * 1024) {
      setError('Please choose a file under 8 MB.');
      return;
    }
    setUploading(true);
    try {
      const { key, url } = await api.post<{ key: string; url: string }>('/prescriptions/upload-url', { contentType: file.type });
      const put = await fetch(url, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (!put.ok) throw new Error('The upload failed. Please try again.');
      setPrescriptionKey(key);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function place() {
    setBusy(true);
    setError('');
    try {
      const order = await api.post<{ id: string }>('/orders', {
        idempotencyKey,
        addressId,
        type,
        paymentMethod,
        ...(type === 'NORMAL' ? { slotStart } : {}),
        ...(prescriptionKey ? { prescriptionKey } : {}),
        ...(rx && covered.length ? { consultationId: rx.consultationId } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        items: lines.map((l) => ({ medicineId: l.id, qty: l.qty, unit: l.unit ?? 'PACK' })),
      });
      cart.clear();
      if (paymentMethod === 'BKASH') {
        const { redirectUrl } = await api.post<{ redirectUrl: string }>('/payments/start', { purpose: 'ORDER', refId: order.id });
        location.href = redirectUrl;
      } else {
        router.replace(`/orders/${order.id}?placed=1`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const steps = useMemo(() => ['Address', 'Time', 'Pay'], []);

  if (!ready) return <div className="page muted">Loading checkout…</div>;

  return (
    <div className="page stack">
      <button className="btn small back glass" type="button" onClick={() => (step === 0 ? router.back() : setStep((s) => s - 1))}>
        ‹ Back
      </button>

      <ol className="steps">
        {steps.map((label, i) => (
          <li key={label} className={step === i ? 'on' : undefined} aria-current={step === i ? 'step' : undefined}>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <>
          <h1 className="title">Address</h1>
          {addresses.length > 0 ? (
            <div className="group" role="radiogroup" aria-label="Address">
              {addresses.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={addressId === a.id} onClick={() => setAddressId(a.id)}>
                  <span className={`mark${addressId === a.id ? ' on' : ''}`} />
                  <span className="grow">
                    <strong>{a.label}</strong>
                    <span className="muted" style={{ display: 'block' }}>{a.line}</span>
                    <span className="muted small" style={{ display: "block" }}>{a.zone.name} · {formatTk(a.zone.deliveryFeePoisha)} delivery{hasPoint(a) ? " · 📍 pinned" : ""}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {address && hasPoint(address) ? (
            <div className="checkout-map">
              <MapView still recenter={false} zoom={16} center={{ lat: address.lat!, lng: address.lng! }} pins={[{ id: 'home', kind: 'home', point: { lat: address.lat!, lng: address.lng! } }]} style={{ height: 130 }} />
              <span className="checkout-map-cap">The rider navigates to this pin</span>
            </div>
          ) : address ? (
            <p className="muted small">This address has no map pin. You can add one from your account so riders find you faster.</p>
          ) : null}
          <button className={`btn block${addresses.length ? '' : ' primary'}`} type="button" onClick={() => setSheet(true)}>
            {addresses.length ? '+ Add address' : '📍 Pin your delivery address'}
          </button>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <h1 className="title">Delivery time</h1>
          <Segmented
            label="Delivery time"
            value={type}
            onChange={setType}
            options={[
              { value: 'NORMAL', label: 'Choose a slot' },
              { value: 'EMERGENCY', label: 'Emergency' },
            ]}
          />
          {type === 'EMERGENCY' ? (
            <div className="card stack">
              {emergency.available ? (
                <>
                  <span className="row between">
                    <strong>Emergency delivery</strong>
                    <span className="price">{formatTk(emergency.feePoisha)}</span>
                  </span>
                  <p className="muted">About {emergency.minutes} minutes, for an extra {formatTk(emergency.feePoisha)}.</p>
                </>
              ) : (
                <p>Emergency delivery is closed right now.</p>
              )}
            </div>
          ) : (
            <>
              {slots.length === 0 ? (
                <p className="muted">No delivery windows are open right now. Try emergency delivery.</p>
              ) : (
                <>
                  <div className="day-tabs" role="tablist" aria-label="Delivery day">
                    {days.map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        role="tab"
                        aria-selected={d.key === activeDay}
                        className={`day-tab${d.key === activeDay ? ' on' : ''}`}
                        onClick={() => {
                          setDay(d.key);
                          if (!slotStart || dayKey(slotStart) !== d.key) setSlotStart(d.slots[0]!.start);
                        }}
                      >
                        <span className="small">{d.label}</span>
                        <strong>{fmtShortDay(d.slots[0]!.start)}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="slot-grid" role="radiogroup" aria-label="Choose a time">
                    {daySlots.map((s) => (
                      <button
                        key={s.start}
                        type="button"
                        role="radio"
                        aria-checked={slotStart === s.start}
                        className={`slot${slotStart === s.start ? ' on' : ''}`}
                        onClick={() => setSlotStart(s.start)}
                      >
                        {fmtTime(s.start)} – {fmtTime(s.end)}
                      </button>
                    ))}
                  </div>
                  {chosen ? <p className="slot-pick">Arrives {fmtWindow(chosen.start, chosen.end)}</p> : null}
                </>
              )}
            </>
          )}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h1 className="title">Payment</h1>
          <Segmented
            label="Payment"
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={[
              { value: 'COD', label: 'Cash on delivery' },
              { value: 'BKASH', label: 'bKash' },
            ]}
          />
          {rx && covered.length ? (
            <div className="notice row between" style={{ gap: 10 }}>
              <span>
                <strong>℞ Covered by {rx.doctor}&rsquo;s prescription</strong>
                <span className="muted small" style={{ display: 'block' }}>
                  {covered.length} prescription medicine{covered.length === 1 ? '' : 's'} · consultation <span className="mono">{rx.code}</span>
                </span>
              </span>
              <span className="chip ok">Verified</span>
            </div>
          ) : null}
          {needsUpload || !rxLines.length ? (
            <label className="field">
              <span>Prescription</span>
              {prescriptionKey ? (
                <span className="chip">Added</span>
              ) : (
                <>
                  <input className="input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={uploading} onChange={(e) => void upload(e)} />
                  <small className="muted">
                    {covered.length
                      ? `Needed for ${rxLines.filter((l) => !covered.includes(l)).map((l) => l.name).join(', ')}, which ${rxLines.length - covered.length === 1 ? 'is' : 'are'} not on your doctor's prescription.`
                      : 'Required for Rx medicines. JPEG, PNG, WebP or PDF under 8 MB.'}
                  </small>
                </>
              )}
            </label>
          ) : null}
          <label className="field">
            <span>Notes</span>
            <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
          </label>
          <div className="group">
            <div className="row between"><span>Subtotal</span><span className="price">{formatTk(subtotal)}</span></div>
            <div className="row between"><span>Delivery</span><span className="price">{formatTk(deliveryFee)}</span></div>
            {emergencyFee ? <div className="row between"><span>Emergency fee</span><span className="price">{formatTk(emergencyFee)}</span></div> : null}
            <div className="row between"><strong>Total</strong><strong className="price">{formatTk(total)}</strong></div>
          </div>
        </>
      ) : null}

      {error ? <p className="error" role="alert">{error}</p> : null}

      <div className="dock">
        {step < 2 ? (
          <button className="btn primary block" type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        ) : (
          <>
            <span className="grow">
              <span className="muted small">Total</span>
              <strong className="mono" style={{ display: 'block', fontSize: '1.45rem' }}>{formatTk(total)}</strong>
            </span>
            <button className="btn primary" type="button" disabled={busy || uploading} onClick={() => void place()}>
              {paymentMethod === 'BKASH' ? 'Pay now' : 'Place order'}
            </button>
          </>
        )}
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="New address">
        {sheet ? (
          <AddressComposer
            defaultPhone={api.user?.phone ?? ''}
            onSaved={(a) => {
              setAddresses((prev) => [a, ...prev.filter((x) => x.id !== a.id)]);
              setAddressId(a.id);
              setSheet(false);
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
