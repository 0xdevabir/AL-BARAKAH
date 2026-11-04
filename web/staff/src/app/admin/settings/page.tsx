'use client';

import { invalidate, isInBangladesh, LargeTitle, LocationPicker, MapView, type PickedLocation, Sheet, SkeletonList, Switch, toast } from '@albarakah/ui';
import { useEffect, useState } from 'react';
import { api, useGet } from '@/lib/api';
import { message, poishaToTk, tkToPoisha } from '@/lib/app';

interface Settings {
  emergencyFeePoisha: number; riderPayoutPoisha: number; riderEmergencyBonusPoisha: number; doctorBookingFeePoisha: number;
  requireRxUpload: boolean; leadHours: number; openHour: number; closeHour: number; slotHours: number; daysAhead: number;
  emergencyStartHour: number; emergencyEndHour: number; emergencyMinutes: number;
  androidLatestVersionCode: number; androidLatestVersionName: string; androidApkUrl: string; androidForceUpdate: boolean; androidUpdateNotes: string;
  pharmacyLat: number; pharmacyLng: number; pharmacyAddress: string;
}

const MONEY = [
  ['emergencyFeePoisha', 'Emergency surcharge', 'Added to every emergency order'],
  ['riderPayoutPoisha', 'Rider payout per delivery', 'Credited when an order is delivered'],
  ['riderEmergencyBonusPoisha', 'Emergency bonus for riders', 'On top of the normal payout'],
  ['doctorBookingFeePoisha', 'Default consultation fee', 'Used when a doctor has no fee of their own'],
] as const;

const hour = (h: number) => (h === 0 || h === 24 ? '12 am' : h === 12 ? '12 pm' : h < 12 ? `${h} am` : `${h - 12} pm`);

export default function SettingsPage() {
  const { data, refetch } = useGet<Settings>('/settings', { staleMs: 60_000 });
  const [s, setS] = useState<Settings | null>(null);
  const [money, setMoney] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draftPin, setDraftPin] = useState<PickedLocation | null>(null);

  useEffect(() => {
    if (!data) return;
    setS(data);
    setMoney(Object.fromEntries(MONEY.map(([k]) => [k, poishaToTk(data[k])])));
  }, [data]);

  if (!s || !data) return <SkeletonList rows={8} />;
  const cur = s;

  const moneyDirty = MONEY.some(([k]) => tkToPoisha(money[k] ?? '') !== data[k]);
  const dirty = moneyDirty || (Object.keys(cur) as (keyof Settings)[]).some((k) => !MONEY.some(([m]) => m === k) && cur[k] !== data[k]);
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setS({ ...cur, [k]: Number(e.target.value) });
  const hourSelect = (k: keyof Settings, from: number, to: number) => (
    <select className="input" value={cur[k] as number} onChange={num(k)}>
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => (
        <option key={h} value={h}>{hour(h)}</option>
      ))}
    </select>
  );

  async function save() {
    const parsed: Record<string, number> = {};
    for (const [k, label] of MONEY) {
      const p = tkToPoisha(money[k] ?? '');
      if (p === null) return toast(`${label}: enter an amount like 50`, 'bad');
      parsed[k] = p;
    }
    if (cur.openHour >= cur.closeHour) return toast('Opening must be before closing', 'bad');
    if (cur.emergencyStartHour >= cur.emergencyEndHour) return toast('Emergency start must be before its end', 'bad');
    setBusy(true);
    try {
      await api.put('/settings', { ...cur, ...parsed });
      toast('Settings saved. Customers see them right away.');
      invalidate('/settings');
      await refetch();
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings">
      <LargeTitle sub="Fees, hours, pickup point and the Android app">Settings</LargeTitle>

      <p className="group-label">Fees and payouts (Tk)</p>
      <div className="group">
        {MONEY.map(([k, label, hint]) => (
          <label key={k} className="setting-row">
            <span className="cell-main">
              <strong>{label}</strong>
              <span className="cell-sub">{hint}</span>
            </span>
            <input className="input num" inputMode="decimal" value={money[k] ?? ''} onChange={(e) => setMoney({ ...money, [k]: e.target.value })} />
          </label>
        ))}
      </div>

      <p className="group-label">Scheduled delivery</p>
      <div className="group">
        <label className="setting-row"><span className="cell-main"><strong>Opens</strong></span>{hourSelect('openHour', 0, 23)}</label>
        <label className="setting-row"><span className="cell-main"><strong>Closes</strong></span>{hourSelect('closeHour', 1, 24)}</label>
        <label className="setting-row">
          <span className="cell-main"><strong>Slot length</strong><span className="cell-sub">Hours per delivery window</span></span>
          <input className="input num" type="number" min={1} max={6} value={cur.slotHours} onChange={num('slotHours')} />
        </label>
        <label className="setting-row">
          <span className="cell-main"><strong>Lead time</strong><span className="cell-sub">Hours between ordering and the first slot</span></span>
          <input className="input num" type="number" min={0} max={72} value={cur.leadHours} onChange={num('leadHours')} />
        </label>
        <label className="setting-row">
          <span className="cell-main"><strong>Days bookable ahead</strong></span>
          <input className="input num" type="number" min={0} max={14} value={cur.daysAhead} onChange={num('daysAhead')} />
        </label>
      </div>
      <p className="group-foot">Customers see slots from {hour(cur.openHour)} to {hour(cur.closeHour)} in {cur.slotHours}-hour windows, up to {cur.daysAhead} days ahead.</p>

      <p className="group-label">Emergency delivery</p>
      <div className="group">
        <label className="setting-row"><span className="cell-main"><strong>Available from</strong></span>{hourSelect('emergencyStartHour', 0, 23)}</label>
        <label className="setting-row"><span className="cell-main"><strong>Until</strong></span>{hourSelect('emergencyEndHour', 1, 24)}</label>
        <label className="setting-row">
          <span className="cell-main"><strong>Promise (minutes)</strong><span className="cell-sub">How fast emergency orders are promised</span></span>
          <input className="input num" type="number" min={15} max={240} step={5} value={cur.emergencyMinutes} onChange={num('emergencyMinutes')} />
        </label>
      </div>

      <p className="group-label">Pharmacy pickup point</p>
      <div className="group">
        <button type="button" className="setting-map" onClick={() => setPicking(true)} aria-label="Move the pharmacy pin">
          <MapView still recenter={false} pins={[{ id: 'store', kind: 'store', point: { lat: cur.pharmacyLat, lng: cur.pharmacyLng } }]} fitKey={`${cur.pharmacyLat},${cur.pharmacyLng}`} style={{ height: 170, borderRadius: 0 }} />
          <span className="setting-map-cta">Move pin</span>
        </button>
        <label className="setting-row stacked">
          <span className="cell-main"><strong>Pickup address</strong><span className="cell-sub">Shown to riders with the map</span></span>
          <input className="input" maxLength={200} placeholder="Shop 4, Road 2, Mirpur 10" value={cur.pharmacyAddress} onChange={(e) => setS({ ...cur, pharmacyAddress: e.target.value })} />
        </label>
      </div>
      <p className="group-foot">Riders start every route here, and customers see the rider leave from this point.</p>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Pharmacy location">
        <div className="stack">
          <LocationPicker
            value={{ lat: cur.pharmacyLat, lng: cur.pharmacyLng }}
            onChange={(v) => setDraftPin(v)}
          />
          <button
            className="btn primary block"
            disabled={!draftPin || !isInBangladesh(draftPin)}
            onClick={() => {
              if (!draftPin) return;
              const place = draftPin.place;
              setS({ ...cur, pharmacyLat: draftPin.lat, pharmacyLng: draftPin.lng, pharmacyAddress: cur.pharmacyAddress || [place?.title, place?.subtitle].filter(Boolean).join(', ') });
              setPicking(false);
            }}
          >
            Use this spot
          </button>
        </div>
      </Sheet>

      <p className="group-label">Prescriptions</p>
      <div className="group">
        <div className="setting-row">
          <span className="cell-main"><strong>Require an Rx photo</strong><span className="cell-sub">Customers must upload one before ordering Rx-only medicine</span></span>
          <Switch label="Require an Rx photo" checked={cur.requireRxUpload} onChange={(v) => setS({ ...cur, requireRxUpload: v })} />
        </div>
      </div>

      <p className="group-label">Android app updates</p>
      <div className="group">
        <label className="setting-row">
          <span className="cell-main"><strong>Latest version code</strong><span className="cell-sub">0 turns update checks off</span></span>
          <input className="input num" type="number" min={0} value={cur.androidLatestVersionCode} onChange={num('androidLatestVersionCode')} />
        </label>
        <label className="setting-row">
          <span className="cell-main"><strong>Version name</strong></span>
          <input className="input num wide" placeholder="1.4.0" value={cur.androidLatestVersionName} onChange={(e) => setS({ ...cur, androidLatestVersionName: e.target.value })} />
        </label>
        <label className="setting-row stacked">
          <span className="cell-main"><strong>APK URL</strong><span className="cell-sub">Blank uses the store’s download link</span></span>
          <input className="input" type="url" value={cur.androidApkUrl} onChange={(e) => setS({ ...cur, androidApkUrl: e.target.value })} />
        </label>
        <label className="setting-row stacked">
          <span className="cell-main"><strong>What’s new</strong></span>
          <textarea className="input" maxLength={500} value={cur.androidUpdateNotes} onChange={(e) => setS({ ...cur, androidUpdateNotes: e.target.value })} />
        </label>
        <div className="setting-row">
          <span className="cell-main"><strong>Force update</strong><span className="cell-sub">Older apps are blocked until they update</span></span>
          <Switch label="Force update" checked={cur.androidForceUpdate} onChange={(v) => setS({ ...cur, androidForceUpdate: v })} />
        </div>
      </div>

      <div className={`savebar${dirty ? ' show' : ''}`} aria-hidden={!dirty}>
        <span className="grow">Unsaved changes</span>
        <button
          className="btn small ghost"
          onClick={() => {
            setS(data);
            setMoney(Object.fromEntries(MONEY.map(([k]) => [k, poishaToTk(data[k])])));
          }}
        >
          Discard
        </button>
        <button className="btn small primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
