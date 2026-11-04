'use client';

import { formatTk } from '@albarakah/domain';
import { fmtWhen, Segmented, Sheet } from '@albarakah/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Channel = 'GOOGLE_MEET' | 'WHATSAPP';
interface Doctor {
  id: string;
  name: string;
  specialty: string;
  bmdcNo: string;
  bio?: string | null;
  feePoisha?: number | null;
  channels: Channel[];
}
interface Slot { start: string; end: string }

export default function DoctorsPage() {
  const router = useRouter();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [defaultFee, setDefaultFee] = useState(0);
  const [selected, setSelected] = useState<Doctor | null>(null);
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [startsAt, setStartsAt] = useState('');
  const [channel, setChannel] = useState<Channel>('GOOGLE_MEET');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [list, settings] = await Promise.all([
          api.get<Doctor[]>('/doctors'),
          api.get<{ doctorFeePoisha?: number }>('/settings/public').catch((): { doctorFeePoisha?: number } => ({})),
        ]);
        setDoctors(list);
        setDefaultFee(settings.doctorFeePoisha ?? 0);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  const feeOf = (d: Doctor) => d.feePoisha ?? defaultFee;

  async function choose(d: Doctor) {
    setSelected(d);
    setChannel(d.channels[0] ?? 'GOOGLE_MEET');
    setStartsAt('');
    setError('');
    setOpen(true);
    setLoadingSlots(true);
    try {
      setSlots((await api.get<Slot[]>(`/doctors/${d.id}/slots`)).slice(0, 40));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function book() {
    if (!api.ready) await api.restore();
    if (!api.user) {
      router.push('/login?next=/doctors');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const c = await api.post<{ id: string }>('/consultations', {
        doctorId: selected!.id,
        startsAt,
        channel,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      const { redirectUrl } = await api.post<{ redirectUrl: string }>('/payments/start', { purpose: 'CONSULTATION', refId: c.id });
      location.href = redirectUrl;
    } catch (err) {
      setError((err as Error).message);
      setStartsAt('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1 className="title">Doctors</h1>
      <div className="group">
        <Link className="chev" href="/doctors/bookings">
          <span className="grow">My bookings</span>
        </Link>
      </div>
      {error && !open ? <p className="error">{error}</p> : null}
      {doctors.length === 0 ? (
        <div className="empty"><p>No doctors are available right now.</p></div>
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          {doctors.map((d) => (
            <button key={d.id} className="card doctor-card" type="button" onClick={() => void choose(d)}>
              <span className="row between">
                <strong>{d.name}</strong>
                <span className="price">{formatTk(feeOf(d))}</span>
              </span>
              <span className="muted" style={{ display: 'block' }}>{d.specialty}</span>
              <span className="muted small">BMDC <span className="mono">{d.bmdcNo}</span></span>
              {d.bio ? <span className="muted small" style={{ display: 'block' }}>{d.bio}</span> : null}
            </button>
          ))}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={selected?.name ?? 'Book'}>
        {selected ? (
          <div className="stack">
            <div>
              <span className="muted">{selected.specialty}</span>
              <span className="row between">
                <span className="muted small">BMDC <span className="mono">{selected.bmdcNo}</span></span>
                <span className="price">{formatTk(feeOf(selected))}</span>
              </span>
            </div>
            {selected.channels.length > 1 ? (
              <Segmented
                label="Call type"
                value={channel}
                onChange={setChannel}
                options={selected.channels.map((c) => ({
                  value: c,
                  label: c === 'GOOGLE_MEET' ? 'Google Meet' : 'WhatsApp',
                }))}
              />
            ) : (
              <p className="muted small">{selected.channels[0] === 'GOOGLE_MEET' ? 'Google Meet' : 'WhatsApp'}</p>
            )}
            <div className="field">
              <span>Choose a slot</span>
              {loadingSlots ? <p className="muted">Loading slots…</p> : null}
              <div className="group">
                {slots.map((s) => (
                  <button key={s.start} type="button" role="radio" aria-checked={startsAt === s.start} onClick={() => setStartsAt(s.start)}>
                    <span className="grow">{fmtWhen(s.start)}</span>
                    <span className={`mark${startsAt === s.start ? ' on' : ''}`} />
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Reason (optional)</span>
              <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button className="btn primary block" type="button" disabled={busy || !startsAt} onClick={() => void book()}>
              {busy ? 'Booking…' : 'Book & pay'}
            </button>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

