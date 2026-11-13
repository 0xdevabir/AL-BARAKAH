'use client';

import { formatTk } from '@albarakah/domain';
import { fmtTime, fmtWeekday, hasPoint, Segmented, Sheet } from '@albarakah/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { type Address, AddressComposer } from '@/components/AddressComposer';
import { api, useApi } from '@/lib/api';
import { telHref, usePublicSettings } from '@/lib/settings';

interface Slot { start: string; end: string }

/**
 * Order straight from a prescription photo: the pharmacy reads it, fills the order and calls
 * to confirm the price before packing. Payment is cash on delivery because the total is not known yet.
 */
export default function PrescriptionOrderPage() {
  const router = useRouter();
  const { user, ready } = useApi();
  const settings = usePublicSettings();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [prescriptionKey, setPrescriptionKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [emergency, setEmergency] = useState({ available: false, feePoisha: 0, minutes: 60 });
  const [type, setType] = useState<'NORMAL' | 'EMERGENCY'>('NORMAL');
  const [slotStart, setSlotStart] = useState('');
  const [notes, setNotes] = useState('');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!ready || !user) return;
    void Promise.all([
      api.get<Address[]>('/addresses'),
      api.get<{ slots: Slot[]; emergency: typeof emergency }>('/delivery-slots'),
    ])
      .then(([a, s]) => {
        setAddresses(a);
        setAddressId(a[0]?.id ?? '');
        setSlots(s.slots);
        setSlotStart(s.slots[0]?.start ?? '');
        setEmergency(s.emergency);
      })
      .catch((err: Error) => setError(err.message));
  }, [ready, user]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    if (f.size > 8 * 1024 * 1024) return setError('Please choose a file under 8 MB.');
    setFile(f);
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : '');
    setPrescriptionKey('');
    setUploading(true);
    try {
      const { key, url } = await api.post<{ key: string; url: string }>('/prescriptions/upload-url', { contentType: f.type });
      const put = await fetch(url, { method: 'PUT', headers: { 'content-type': f.type }, body: f });
      if (!put.ok) throw new Error('The upload failed. Please try again.');
      setPrescriptionKey(key);
    } catch (err) {
      setError((err as Error).message);
      setFile(undefined);
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
        paymentMethod: 'COD',
        prescriptionKey,
        items: [],
        ...(type === 'NORMAL' ? { slotStart } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      router.replace(`/orders/${order.id}?placed=1`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hotline = settings?.hotlines?.[0];
  const canPlace = !!prescriptionKey && !!addressId && (type === 'EMERGENCY' ? emergency.available : !!slotStart) && !busy;

  if (ready && !user) {
    return (
      <div className="page stack">
        <h1 className="title">Order by prescription</h1>
        <section className="rx-hero">
          <RxGlyph />
          <h2>Snap your prescription, we do the rest</h2>
          <p className="muted">Our pharmacist reads it, packs every medicine and calls you with the price. Pay when it arrives.</p>
          <Link className="btn primary" href="/login?next=/prescription">Sign in to upload</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page stack">
      <h1 className="title">Order by prescription</h1>
      <p className="muted">Upload a clear photo. A pharmacist fills the order and calls you to confirm before packing. Cash on delivery.</p>

      <label className={`rx-drop${file ? ' has' : ''}`}>
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" disabled={uploading} onChange={(e) => void pick(e)} />
        {preview ? <img src={preview} alt="Your prescription" /> : <RxGlyph />}
        <span className="rx-drop-text">
          <strong>{uploading ? 'Uploading…' : prescriptionKey ? 'Prescription added' : file ? file.name : 'Take a photo or choose a file'}</strong>
          <span className="muted small">{prescriptionKey ? 'Tap to replace' : 'JPEG, PNG, WebP or PDF under 8 MB'}</span>
        </span>
        {prescriptionKey ? <span className="chip ok">✓</span> : null}
      </label>

      <h2 className="section-title">Deliver to</h2>
      {addresses.length ? (
        <div className="group" role="radiogroup" aria-label="Address">
          {addresses.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={addressId === a.id} onClick={() => setAddressId(a.id)}>
              <span className={`mark${addressId === a.id ? ' on' : ''}`} />
              <span className="grow">
                <strong>{a.label}</strong>
                <span className="muted small" style={{ display: 'block' }}>{a.line} · {a.zone.name}{hasPoint(a) ? ' · 📍' : ''}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <button className="btn block" type="button" onClick={() => setSheet(true)}>
        {addresses.length ? '+ Add address' : '📍 Pin your delivery address on the map'}
      </button>

      <h2 className="section-title">When</h2>
      <Segmented
        label="Delivery time"
        value={type}
        onChange={setType}
        options={[
          { value: 'NORMAL', label: 'Choose a slot' },
          { value: 'EMERGENCY', label: 'Urgent' },
        ]}
      />
      {type === 'EMERGENCY' ? (
        <p className="notice">
          {emergency.available
            ? `About ${emergency.minutes} minutes for ${formatTk(emergency.feePoisha)}. The regular delivery fee is waived.`
            : 'Urgent delivery is closed right now.'}
        </p>
      ) : slots.length ? (
        <select className="input" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} aria-label="Delivery slot">
          {slots.map((s) => (
            <option key={s.start} value={s.start}>
              {fmtWeekday(s.start)} · {fmtTime(s.start)} – {fmtTime(s.end)}
            </option>
          ))}
        </select>
      ) : (
        <p className="muted">No delivery windows are open right now.</p>
      )}

      <label className="field">
        <span>Notes for the pharmacist</span>
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="e.g. only the first page, 7 days of each" />
      </label>

      {hotline ? (
        <p className="muted small">
          Prefer to talk? Call <a href={telHref(hotline)}>{hotline}</a>.
        </p>
      ) : null}

      {error ? <p className="error" role="alert">{error}</p> : null}

      <div className="dock">
        <span className="grow muted small">Price confirmed by phone · Cash on delivery</span>
        <button className="btn primary" type="button" disabled={!canPlace} onClick={() => void place()}>
          {busy ? 'Sending…' : 'Send order'}
        </button>
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

function RxGlyph() {
  return (
    <span className="rx-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M14 3v4h4M9 12h2.5a1.5 1.5 0 0 1 0 3H9v-3Zm0 3v3m2-3 3 3" />
      </svg>
    </span>
  );
}
