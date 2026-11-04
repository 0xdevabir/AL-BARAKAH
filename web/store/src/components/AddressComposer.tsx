'use client';

import { formatTk } from '@albarakah/domain';
import { haptic, hasPoint, invalidate, type LatLng, LocationPicker, MapView, type PickedLocation, type Place, toast } from '@albarakah/ui';
import { useMemo, useState } from 'react';
import { api, useGet } from '@/lib/api';

export interface Zone { id: string; name: string; deliveryFeePoisha: number }
export interface Address { id: string; label: string; line: string; phone: string; notes?: string | null; lat?: number | null; lng?: number | null; zone: Zone }
interface PublicSettings { pharmacy?: LatLng & { address: string } }

const LABELS = ['Home', 'Office', 'Parents'];

/** Best zone for a reverse-geocoded place: any zone whose name appears in the place, longest first. */
function matchZone(zones: Zone[], place: Place | null): Zone | null {
  if (!place) return null;
  const text = `${place.title} ${place.subtitle}`.toLowerCase();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ঀ-৿ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const hits = zones.filter((z) => {
    const n = norm(z.name);
    return n.length > 2 && (text.includes(n) || n.split(' ').some((w) => w.length > 3 && text.includes(w)));
  });
  return hits.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

const placeLine = (p: Place | null) => (p ? [p.title, p.subtitle].filter(Boolean).join(', ').slice(0, 200) : '');

/**
 * Add or edit an address in two steps, like ride-hailing apps: drop the pin on the map,
 * then confirm the written details. The pin is what the rider navigates to.
 */
export function AddressComposer({ initial, defaultPhone, onSaved }: { initial?: Address; defaultPhone: string; onSaved: (a: Address) => void }) {
  const { data: zones } = useGet<Zone[]>('/zones', { staleMs: 300_000 });
  const { data: settings } = useGet<PublicSettings>('/settings/public', { staleMs: 600_000 });
  const startPin = initial && hasPoint(initial) ? { lat: initial.lat!, lng: initial.lng! } : null;
  const [step, setStep] = useState<'pin' | 'details'>(initial ? 'details' : 'pin');
  const [pin, setPin] = useState<PickedLocation | null>(startPin ? { ...startPin, place: null } : null);
  const [draftPin, setDraftPin] = useState<PickedLocation | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [d, setD] = useState({
    label: initial?.label ?? 'Home',
    line: initial?.line ?? '',
    zoneId: initial?.zone.id ?? '',
    phone: (initial?.phone ?? defaultPhone).replace(/^\+88/, ''),
    notes: initial?.notes ?? '',
  });
  const [autoZone, setAutoZone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zoneId = d.zoneId || autoZone || zones?.[0]?.id || '';
  const zone = zones?.find((z) => z.id === zoneId);
  const near = useMemo(() => (settings?.pharmacy ? { lat: settings.pharmacy.lat, lng: settings.pharmacy.lng } : undefined), [settings?.pharmacy?.lat, settings?.pharmacy?.lng]);

  function confirmPin() {
    if (!draftPin) return;
    haptic('light');
    setPin(draftPin);
    setSkipped(false);
    const guess = zones ? matchZone(zones, draftPin.place) : null;
    if (guess) {
      setAutoZone(guess.id);
      setD((x) => ({ ...x, zoneId: '' }));
    }
    // Prefill the written address only when it is still empty, so we never clobber typing.
    setD((x) => ({ ...x, line: x.line.trim() ? x.line : placeLine(draftPin.place) }));
    setStep('details');
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!zoneId) return;
    setBusy(true);
    try {
      const body = {
        label: d.label.trim(),
        line: d.line.trim(),
        zoneId,
        phone: d.phone.trim(),
        ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
        ...(pin ? { lat: +pin.lat.toFixed(6), lng: +pin.lng.toFixed(6) } : {}),
      };
      const a = initial ? await api.put<Address>(`/addresses/${initial.id}`, body) : await api.post<Address>('/addresses', body);
      haptic('success');
      toast(initial ? 'Address updated' : 'Address saved');
      invalidate('/addresses');
      onSaved(a);
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'pin') {
    return (
      <div className="stack composer">
        <ol className="composer-steps" aria-label="Steps">
          <li className="on">Pin your door</li>
          <li>Details</li>
        </ol>
        <LocationPicker value={pin} near={near} autoLocate={!pin} onChange={setDraftPin} />
        <button className="btn primary block" type="button" disabled={!draftPin} onClick={confirmPin}>Confirm location</button>
        <button
          className="btn ghost block small"
          type="button"
          onClick={() => {
            setSkipped(true);
            setStep('details');
          }}
        >
          Type the address instead
        </button>
      </div>
    );
  }

  return (
    <form className="stack composer" onSubmit={(e) => void save(e)}>
      <ol className="composer-steps" aria-label="Steps">
        <li className="done" onClick={() => setStep('pin')}>Pin your door</li>
        <li className="on">Details</li>
      </ol>

      {pin ? (
        <button type="button" className="composer-map" onClick={() => setStep('pin')} aria-label="Move the pin">
          <MapView still recenter={false} zoom={16} center={pin} pins={[{ id: 'home', kind: 'home', point: pin }]} style={{ height: 140 }} />
          <span className="composer-map-cta">Move pin</span>
        </button>
      ) : (
        <button type="button" className="composer-nopin" onClick={() => setStep('pin')}>
          <strong>{skipped ? 'No pin on the map' : 'Add a map pin'}</strong>
          <span className="muted small">Riders find you faster with a pin. Tap to add one.</span>
        </button>
      )}

      <div className="row wrap" style={{ gap: 8 }}>
        {LABELS.map((l) => (
          <button key={l} type="button" className={`chip${d.label === l ? ' live' : ''}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setD({ ...d, label: l })}>{l}</button>
        ))}
      </div>
      <label className="field">
        <span>Label</span>
        <input className="input" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} required maxLength={40} />
      </label>
      <label className="field">
        <span>House, road and area</span>
        <textarea className="input" value={d.line} placeholder="House 12, Road 5, Block C, Mirpur 10" onChange={(e) => setD({ ...d, line: e.target.value })} required minLength={3} maxLength={200} />
      </label>
      <label className="field">
        <span>
          Delivery zone {autoZone && !d.zoneId ? <span className="chip live" style={{ marginLeft: 6, minHeight: 20, fontSize: '0.75rem' }}>Matched from map</span> : null}
        </span>
        <select className="input" value={zoneId} onChange={(e) => setD({ ...d, zoneId: e.target.value })} required>
          {zones?.map((z) => <option key={z.id} value={z.id}>{z.name} ({formatTk(z.deliveryFeePoisha)})</option>)}
        </select>
        {zone ? <span className="muted small">Delivery fee {formatTk(zone.deliveryFeePoisha)}</span> : null}
      </label>
      <label className="field">
        <span>Phone for the rider</span>
        <input className="input" type="tel" inputMode="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} required />
      </label>
      <label className="field">
        <span>Directions <span className="muted small">(optional)</span></span>
        <input className="input" value={d.notes} placeholder="Gate colour, landmark, floor" maxLength={200} onChange={(e) => setD({ ...d, notes: e.target.value })} />
      </label>
      <button className="btn primary block" disabled={busy || !zoneId}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Save address'}</button>
    </form>
  );
}
