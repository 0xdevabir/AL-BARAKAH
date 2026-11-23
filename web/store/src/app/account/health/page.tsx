'use client';

import { invalidate, Skeleton, toast } from '@albarakah/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, useGet } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';

export interface Health {
  dateOfBirth: string | null; sex: string; weightKg: number | null; bloodGroup: string;
  allergies: string; conditions: string; medications: string; updatedAt: string | null;
}
const BLOOD = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/** What the doctor sees before the call. Filling it in once saves repeating it on every consultation. */
export default function HealthPage() {
  const user = useSignedIn('/account/health');
  const { data, error } = useGet<Health>(user ? '/me/health' : null);
  const [f, setF] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data && !f) setF(data); }, [data, f]);

  if (error) return <div className="page"><p className="error">{error.message}</p></div>;
  if (!f) return <div className="page stack"><Skeleton h={36} w="60%" /><Skeleton h={300} r={18} /></div>;

  const text = (k: 'allergies' | 'conditions' | 'medications') => (e: React.ChangeEvent<HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f) return;
    setBusy(true);
    try {
      await api.put('/me/health', {
        dateOfBirth: f.dateOfBirth ? f.dateOfBirth.slice(0, 10) : '',
        sex: f.sex, weightKg: f.weightKg, bloodGroup: f.bloodGroup,
        allergies: f.allergies, conditions: f.conditions, medications: f.medications,
      });
      invalidate('/me/health');
      toast('Saved. Your doctor will see this before each call.');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack screen">
      <Link className="btn small back glass" href="/account">‹ Account</Link>
      <h1 className="title">Health profile</h1>
      <p className="muted" style={{ marginTop: -6 }}>Shared only with doctors you book, so they can prescribe safely. Leave anything you are unsure of blank.</p>

      <div className="group">
        <label className="field">Date of birth
          <input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={f.dateOfBirth?.slice(0, 10) ?? ''} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value || null })} />
        </label>
        <label className="field">Sex
          <select className="input" value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value })}>
            <option value="">Prefer not to say</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="field">Weight (kg)
          <input className="input num" type="number" inputMode="decimal" min={0.5} max={400} step={0.1} value={f.weightKg ?? ''} onChange={(e) => setF({ ...f, weightKg: e.target.value ? Number(e.target.value) : null })} />
        </label>
        <label className="field">Blood group
          <select className="input" value={f.bloodGroup} onChange={(e) => setF({ ...f, bloodGroup: e.target.value })}>
            {BLOOD.map((b) => <option key={b} value={b}>{b || 'Not known'}</option>)}
          </select>
        </label>
      </div>

      <div className="group">
        <label className="field">Allergies
          <textarea className="input" maxLength={500} rows={2} placeholder="Medicines or foods, e.g. penicillin, peanuts" value={f.allergies} onChange={text('allergies')} />
        </label>
        <label className="field">Long-term conditions
          <textarea className="input" maxLength={500} rows={2} placeholder="e.g. diabetes, high blood pressure, asthma, pregnancy" value={f.conditions} onChange={text('conditions')} />
        </label>
        <label className="field">Medicines you take now
          <textarea className="input" maxLength={500} rows={2} placeholder="Name and dose, e.g. Metformin 500 mg twice daily" value={f.medications} onChange={text('medications')} />
        </label>
      </div>

      <button className="btn primary block" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  );
}
