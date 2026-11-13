'use client';

import { formatTk } from '@albarakah/domain';
import { Sheet } from '@albarakah/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, useApi, useGet } from '@/lib/api';

interface Status { available: boolean; doctorsOnDuty: number; feePoisha: number; responseMinutes: number }

/** Prepaid video call with an on-duty MBBS doctor, answered within minutes instead of booked for later. */
export function InstantConsult() {
  const router = useRouter();
  const { user } = useApi();
  const { data: s } = useGet<Status>('/consultations/instant/status', { staleMs: 30_000, pollMs: 60_000 });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true);
    setError('');
    try {
      const c = await api.post<{ id: string; status: string }>('/consultations/instant', { reason: reason.trim() });
      // An instant consult the customer already paid for is reopened rather than charged twice.
      if (c.status !== 'HOLD') return router.push(`/doctors/bookings/${c.id}`);
      const { redirectUrl } = await api.post<{ redirectUrl: string }>('/payments/start', { purpose: 'CONSULTATION', refId: c.id });
      location.href = redirectUrl;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!s) return null;

  return (
    <>
      <section className={`instant-card${s.available ? ' on' : ''}`}>
        <span className="instant-badge">{s.available ? <><span className="instant-pulse" aria-hidden="true" /> {s.doctorsOnDuty} doctor{s.doctorsOnDuty === 1 ? '' : 's'} online</> : 'Offline'}</span>
        <h2>Talk to a doctor now</h2>
        <p>Video call with an MBBS doctor within {s.responseMinutes} minutes. Prescription in the app.</p>
        <button
          className="btn primary"
          type="button"
          disabled={!s.available}
          onClick={() => (user ? setOpen(true) : router.push('/login?next=/doctors'))}
        >
          {s.available ? `Start · ${formatTk(s.feePoisha)}` : 'No doctor on duty right now'}
        </button>
      </section>
      <Sheet open={open} onClose={() => setOpen(false)} title="Instant consultation">
        <div className="stack">
          <label className="field">
            <span>What is bothering you?</span>
            <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} placeholder="e.g. fever since yesterday, sore throat" autoFocus />
          </label>
          <p className="muted small">
            Pay {formatTk(s.feePoisha)} with bKash. A doctor joins within about {s.responseMinutes} minutes. If no one can take the call, you are refunded.
          </p>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="btn primary block" type="button" disabled={busy || reason.trim().length < 3} onClick={() => void start()}>
            {busy ? 'Starting…' : `Pay ${formatTk(s.feePoisha)} with bKash`}
          </button>
        </div>
      </Sheet>
    </>
  );
}
