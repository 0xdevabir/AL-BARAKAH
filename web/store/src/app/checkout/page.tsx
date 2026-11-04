'use client';

import { formatTk } from '@albarakah/domain';
import { fmtWindow, Segmented, Sheet } from '@albarakah/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useCart } from '@/lib/useCart';

interface Zone { id: string; name: string; deliveryFeePoisha: number }
interface Address { id: string; label: string; line: string; phone: string; zone: Zone }
interface Slot { start: string; end: string }

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, lines, subtotal } = useCart();
  const [step, setStep] = useState(0);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
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
  const [draft, setDraft] = useState({ label: '', line: '', zoneId: '', phone: '' });
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [ready, setReady] = useState(false);

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
        const [a, z, s] = await Promise.all([
          api.get<Address[]>('/addresses'),
          api.get<Zone[]>('/zones'),
          api.get<{ slots: Slot[]; emergency: typeof emergency }>('/delivery-slots'),
        ]);
        setAddresses(a);
        setZones(z);
        setSlots(s.slots);
        setEmergency(s.emergency);
        setAddressId(a[0]?.id ?? '');
        setSlotStart(s.slots[0]?.start ?? '');
        setDraft((d) => ({
          ...d,
          phone: api.user!.phone.replace('+88', ''),
          zoneId: z[0]?.id ?? '',
        }));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setReady(true);
      }
    })();
  }, [lines.length, router]);

  async function saveAddress(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const a = await api.post<Address>('/addresses', draft);
      setAddresses((prev) => [a, ...prev]);
      setAddressId(a.id);
      setSheet(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

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
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        items: lines.map((l) => ({ medicineId: l.id, qty: l.qty })),
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
      <button className="btn ghost small" type="button" onClick={() => (step === 0 ? router.back() : setStep((s) => s - 1))} style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>
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
                    <span className="muted small" style={{ display: 'block' }}>{a.zone.name}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <button className="btn block" type="button" onClick={() => setSheet(true)}>
            + Add address
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
              <p className="muted small">Earliest available windows first.</p>
              <div className="group" role="radiogroup" aria-label="Choose a slot">
                {slots.map((s) => (
                  <button key={s.start} type="button" role="radio" aria-checked={slotStart === s.start} onClick={() => setSlotStart(s.start)}>
                    <span className="grow">{fmtWindow(s.start, s.end)}</span>
                    <span className={`mark${slotStart === s.start ? ' on' : ''}`} />
                  </button>
                ))}
              </div>
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
          <label className="field">
            <span>Prescription</span>
            {prescriptionKey ? (
              <span className="chip">Added</span>
            ) : (
              <>
                <input className="input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={uploading} onChange={(e) => void upload(e)} />
                <small className="muted">Required for Rx medicines. JPEG, PNG, WebP or PDF under 8 MB.</small>
              </>
            )}
          </label>
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

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Add address">
        <form className="stack" onSubmit={(e) => void saveAddress(e)}>
          <label className="field">
            <span>Label</span>
            <input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Home" required maxLength={40} />
          </label>
          <label className="field">
            <span>Address</span>
            <textarea className="input" value={draft.line} onChange={(e) => setDraft({ ...draft, line: e.target.value })} required minLength={3} maxLength={200} />
          </label>
          <label className="field">
            <span>Zone</span>
            <select className="input" value={draft.zoneId} onChange={(e) => setDraft({ ...draft, zoneId: e.target.value })} required>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({formatTk(z.deliveryFeePoisha)})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Phone</span>
            <input className="input" type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} required />
          </label>
          <button className="btn primary block" type="submit">
            Save
          </button>
        </form>
      </Sheet>
    </div>
  );
}
