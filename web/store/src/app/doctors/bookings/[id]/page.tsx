'use client';

import { formatTk } from '@albarakah/domain';
import { fmtRelative, fmtWhen, Skeleton, statusLabel, statusTone, toast } from '@albarakah/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useGet } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';

interface RxItem { medicine: string; dose: string; frequency: string; days: number; instructions: string }
interface Booking {
  id: string; code: string; startsAt: string; endsAt: string; status: string; channel: 'GOOGLE_MEET' | 'WHATSAPP'; feePoisha: number;
  reason?: string | null;
  prescription: { diagnosis: string; items: RxItem[]; advice: string; followUpDays: number } | null;
  doctor: { name: string; specialty: string; meetLink: string | null; whatsapp: string | null };
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useSignedIn(`/doctors/bookings/${id}`);
  const { data: b, error } = useGet<Booking>(user ? `/consultations/${id}` : null, { pollMs: 60_000 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (error) return <div className="page"><p className="error">{error.message}</p></div>;
  if (!b) {
    return (
      <div className="page stack">
        <Skeleton h={36} w="60%" />
        <Skeleton h={120} r={18} />
      </div>
    );
  }

  const join = b.doctor.meetLink ?? (b.doctor.whatsapp ? `https://wa.me/${b.doctor.whatsapp.replace(/\D/g, '')}` : null);
  const startsIn = new Date(b.startsAt).getTime() - now;
  const joinable = b.status === 'CONFIRMED' && startsIn < 10 * 60_000 && new Date(b.endsAt).getTime() > now;
  const rx = b.prescription;

  return (
    <div className="page stack screen">
      <Link className="btn ghost small" href="/doctors/bookings" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>‹ Bookings</Link>
      <div>
        <span className={`chip ${statusTone(b.status)}`}>{statusLabel(b.status)}</span>
        <h1 className="title" style={{ marginTop: 8 }}>{b.doctor.name}</h1>
        <p className="muted">{b.doctor.specialty}</p>
      </div>
      <div className="card">
        <strong>{fmtWhen(b.startsAt)}</strong>
        {b.status === 'CONFIRMED' ? <span className="muted small">{startsIn > 0 ? `Starts ${fmtRelative(b.startsAt, now)}` : 'Happening now'}</span> : null}
      </div>
      <div className="group">
        <div className="row between"><span className="muted">Call</span><span>{b.channel === 'GOOGLE_MEET' ? 'Google Meet' : 'WhatsApp'}</span></div>
        <div className="row between"><span className="muted">Fee</span><span className="price">{formatTk(b.feePoisha)}</span></div>
        <div className="row between"><span className="muted">Booking</span><span className="mono">{b.code}</span></div>
      </div>
      {b.reason ? <p className="muted">“{b.reason}”</p> : null}

      {join && b.status === 'CONFIRMED' ? (
        <a className={`btn block${joinable ? ' primary' : ''}`} href={join} target="_blank" rel="noreferrer">
          {joinable ? 'Join call now' : `Join link (${b.channel === 'GOOGLE_MEET' ? 'Meet' : 'WhatsApp'})`}
        </a>
      ) : null}
      {b.status === 'HOLD' ? <p className="notice">Waiting for payment. The call link appears once it is paid.</p> : null}

      {rx ? (
        <div className="card stack">
          <div className="row between">
            <strong style={{ fontSize: '1.4rem', fontFamily: 'Georgia, serif' }}>℞ Prescription</strong>
            <button
              className="btn small ghost"
              onClick={() => {
                const text = [
                  `${b.doctor.name} · ${b.doctor.specialty}`,
                  rx.diagnosis && `Diagnosis: ${rx.diagnosis}`,
                  ...rx.items.map((i, n) => `${n + 1}. ${i.medicine} ${i.dose} — ${i.frequency}${i.days ? ` × ${i.days} days` : ''}${i.instructions ? ` (${i.instructions})` : ''}`),
                  rx.advice && `Advice: ${rx.advice}`,
                  rx.followUpDays ? `Follow up in ${rx.followUpDays} days` : '',
                ].filter(Boolean).join('\n');
                void navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast('Could not copy', 'bad'));
              }}
            >
              Copy
            </button>
          </div>
          {rx.diagnosis ? <p><span className="muted small">Diagnosis</span><br /><strong>{rx.diagnosis}</strong></p> : null}
          {rx.items.length ? (
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rx.items.map((i, n) => (
                <li key={n}>
                  <Link href={`/search?q=${encodeURIComponent(i.medicine)}`}><strong>{i.medicine}</strong> {i.dose}</Link>
                  <span className="muted small" style={{ display: 'block' }}>{[i.frequency, i.days ? `${i.days} days` : '', i.instructions].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {rx.advice ? <p className="small"><span className="muted">Advice: </span>{rx.advice}</p> : null}
          {rx.followUpDays ? (
            <p className="small"><span className="muted">Follow up: </span>in {rx.followUpDays} days — <Link href="/doctors">book again</Link></p>
          ) : null}
          <p className="muted small">Tap a medicine to find it in the store.</p>
        </div>
      ) : null}
    </div>
  );
}
