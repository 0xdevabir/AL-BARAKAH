'use client';

import { fmtWhen } from '@albarakah/ui';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { message, statusLabel } from '@/lib/app';

interface Booking {
  id: string;
  startsAt: string;
  status: string;
  channel: string;
  reason: string | null;
  patientPhone: string;
  notes: string | null;
  customer: { name: string };
}

export default function DoctorBookingsPage() {
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setRows(await api.get<Booking[]>('/doctor/bookings'));
    } catch (err) {
      setError(message(err));
    }
  }

  useEffect(() => {
    void load();
    void api
      .get<{ meetLink: string | null }>('/doctor/me')
      .then((r) => setMeetLink(r.meetLink))
      .catch((err) => setError(message(err)));
  }, []);

  async function finish(b: Booking, status: 'COMPLETED' | 'NO_SHOW') {
    setBusy(true);
    setError('');
    const notes = drafts[b.id]?.trim();
    try {
      await api.patch(`/doctor/bookings/${b.id}`, { status, ...(notes ? { notes } : {}) });
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack">
      <h1 className="title">Bookings</h1>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {rows?.length === 0 ? <p className="empty">No bookings yet</p> : null}
      {(rows ?? []).map((b) => (
        <article key={b.id} className="card stack">
          <div className="row wrap">
            <strong>{fmtWhen(b.startsAt)}</strong>
            <span className="chip">{statusLabel(b.status)}</span>
          </div>
          <div>
            <p>
              {b.customer.name || 'Patient'} ·{' '}
              <a className="mono" href={`tel:${b.patientPhone}`}>
                {b.patientPhone}
              </a>
            </p>
            <p className="muted small">{statusLabel(b.channel)}</p>
            {b.reason ? <p className="small">{b.reason}</p> : null}
          </div>
          {b.status === 'CONFIRMED' ? (
            <>
              {b.channel === 'WHATSAPP' ? (
                <a className="btn" href={`https://wa.me/${b.patientPhone.replace('+', '')}`} rel="noopener" target="_blank">
                  Open WhatsApp
                </a>
              ) : null}
              {b.channel === 'GOOGLE_MEET' && meetLink ? (
                <a className="btn" href={meetLink} rel="noopener" target="_blank">
                  Open Google Meet
                </a>
              ) : null}
              <label className="field">
                <span>Private notes (optional)</span>
                <textarea
                  className="input"
                  value={drafts[b.id] ?? ''}
                  onChange={(e) => setDrafts({ ...drafts, [b.id]: e.target.value })}
                  maxLength={2000}
                />
              </label>
              <div className="row wrap">
                <button className="btn primary grow" type="button" disabled={busy} onClick={() => void finish(b, 'COMPLETED')}>
                  Mark completed
                </button>
                <button className="btn danger" type="button" disabled={busy} onClick={() => void finish(b, 'NO_SHOW')}>
                  Patient missed it
                </button>
              </div>
            </>
          ) : b.notes ? (
            <p className="small muted">{b.notes}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
