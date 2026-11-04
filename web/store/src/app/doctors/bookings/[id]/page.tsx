'use client';

import { formatTk } from '@albarakah/domain';
import { fmtTime, Skeleton, statusLabel, statusTone, toast } from '@albarakah/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useGet } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { calendarLink, CHANNEL, countdown, dayName } from '@/lib/doctors';

interface RxItem { medicine: string; dose: string; frequency: string; days: number; instructions: string }
interface Booking {
  id: string; code: string; startsAt: string; endsAt: string; status: string; channel: 'GOOGLE_MEET' | 'WHATSAPP'; feePoisha: number;
  reason?: string | null;
  prescription: { diagnosis: string; items: RxItem[]; advice: string; followUpDays: number } | null;
  doctor: { name: string; specialty: string; meetLink: string | null; whatsapp: string | null };
}

const rxText = (b: Booking) => {
  const rx = b.prescription!;
  return [
    `${b.doctor.name} · ${b.doctor.specialty}`,
    rx.diagnosis && `Diagnosis: ${rx.diagnosis}`,
    ...rx.items.map((i, n) => `${n + 1}. ${i.medicine} ${i.dose} — ${i.frequency}${i.days ? ` × ${i.days} days` : ''}${i.instructions ? ` (${i.instructions})` : ''}`),
    rx.advice && `Advice: ${rx.advice}`,
    rx.followUpDays ? `Follow up in ${rx.followUpDays} days` : '',
  ].filter(Boolean).join('\n');
};

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useSignedIn(`/doctors/bookings/${id}`);
  const { data: b, error } = useGet<Booking>(user ? `/consultations/${id}` : null, { pollMs: 30_000 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  if (error) return <div className="page"><p className="error">{error.message}</p></div>;
  if (!b) {
    return (
      <div className="page stack">
        <Skeleton h={36} w="60%" />
        <Skeleton h={160} r={22} />
        <Skeleton h={120} r={18} />
      </div>
    );
  }

  const join = b.doctor.meetLink ?? (b.doctor.whatsapp ? `https://wa.me/${b.doctor.whatsapp.replace(/\D/g, '')}` : null);
  const startsIn = new Date(b.startsAt).getTime() - now;
  const ended = new Date(b.endsAt).getTime() <= now;
  const live = b.status === 'CONFIRMED' && startsIn <= 0 && !ended;
  const joinable = b.status === 'CONFIRMED' && startsIn < 10 * 60_000 && !ended;
  const rx = b.prescription;
  const meet = b.channel === 'GOOGLE_MEET';

  // Where the patient is in the journey; each step says plainly what happens.
  const stage = b.status === 'HOLD' ? 0 : b.status === 'CONFIRMED' ? (live || joinable ? 2 : 1) : b.status === 'COMPLETED' ? (rx ? 4 : 3) : -1;
  const steps = [
    { t: 'Booked', d: b.status === 'HOLD' ? 'Waiting for your bKash payment' : 'Paid and confirmed' },
    { t: 'Get ready', d: 'Keep old prescriptions and test reports nearby, and find a quiet spot' },
    { t: meet ? 'Join the video call' : 'Answer the WhatsApp call', d: meet ? 'The Join button turns on 10 minutes before' : 'The doctor calls your number at the time' },
    { t: 'Consultation done', d: 'The doctor writes your prescription' },
    { t: 'Prescription ready', d: 'Order the medicines from the store in a tap' },
  ];

  return (
    <div className="page stack screen">
      <Link className="btn small back glass" href="/doctors/bookings">‹ Consultations</Link>

      <section className={`consult-hero${live ? ' live' : ''}`}>
        <span className={`chip ${live ? 'live' : statusTone(b.status)}`}>{live ? 'Happening now' : statusLabel(b.status)}</span>
        <h1 className="title" style={{ margin: '10px 0 2px' }}>{b.doctor.name}</h1>
        <p className="muted" style={{ margin: 0 }}>{b.doctor.specialty}</p>
        <div className="consult-when">
          <div>
            <span className="muted small">{dayName(b.startsAt, now)}</span>
            <strong>{fmtTime(b.startsAt)} – {fmtTime(b.endsAt)}</strong>
          </div>
          {b.status === 'CONFIRMED' && !ended ? (
            <div style={{ textAlign: 'right' }}>
              <span className="muted small">{live ? 'Started' : 'Starts in'}</span>
              <strong>{live ? 'Now' : countdown(startsIn)}</strong>
            </div>
          ) : null}
        </div>
        {join && b.status === 'CONFIRMED' && !ended ? (
          <a className={`btn block${joinable ? ' primary' : ''}`} href={join} target="_blank" rel="noreferrer" aria-disabled={!joinable}>
            {CHANNEL[b.channel].icon} {joinable ? (meet ? 'Join the video call' : 'Open WhatsApp') : `${meet ? 'Join' : 'WhatsApp'} opens 10 min before`}
          </a>
        ) : null}
        {b.status === 'CONFIRMED' && !ended && startsIn > 10 * 60_000 ? (
          <a className="btn ghost block small" href={calendarLink(`Doctor call · ${b.doctor.name}`, b.startsAt, b.endsAt, `${CHANNEL[b.channel].label}. Open the Al-Barakah app to join. Booking ${b.code}`)} target="_blank" rel="noreferrer">
            🔔 Add a reminder to my calendar
          </a>
        ) : null}
        {b.status === 'HOLD' ? <p className="notice" style={{ margin: 0 }}>Waiting for payment. The call link appears once it is paid.</p> : null}
      </section>

      {stage >= 0 ? (
        <ol className="journey" aria-label="What happens next">
          {steps.map((s, i) => (
            <li key={s.t} className={i < stage ? 'done' : i === stage ? 'now' : undefined}>
              <span className="journey-dot" aria-hidden="true">{i < stage ? '✓' : i + 1}</span>
              <span>
                <strong>{s.t}</strong>
                <span className="muted small" style={{ display: 'block' }}>{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="group">
        <div className="row between"><span className="muted">Call</span><span>{CHANNEL[b.channel].icon} {CHANNEL[b.channel].label}</span></div>
        <div className="row between"><span className="muted">Fee</span><span className="price">{formatTk(b.feePoisha)}</span></div>
        <div className="row between"><span className="muted">Booking</span><span className="mono">{b.code}</span></div>
        {b.reason ? <div className="row between" style={{ gap: 16 }}><span className="muted">About</span><span style={{ textAlign: 'right' }}>{b.reason}</span></div> : null}
      </div>

      {rx ? (
        <div className="card stack rx-card">
          <div className="row between">
            <strong style={{ fontSize: '1.4rem', fontFamily: 'Georgia, serif' }}>℞ Prescription</strong>
            <span className="row" style={{ gap: 4 }}>
              <button className="btn small ghost" onClick={() => void navigator.clipboard?.writeText(rxText(b)).then(() => toast('Copied'), () => toast('Could not copy', 'bad'))}>Copy</button>
              <button className="btn small ghost" onClick={() => window.print()}>Print</button>
            </span>
          </div>
          {rx.diagnosis ? <p style={{ margin: 0 }}><span className="muted small">Diagnosis</span><br /><strong>{rx.diagnosis}</strong></p> : null}
          {rx.items.length ? (
            <ol className="rx-items">
              {rx.items.map((i, n) => (
                <li key={n}>
                  <span className="rx-n">{n + 1}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <strong>{i.medicine}</strong> {i.dose}
                    <span className="muted small" style={{ display: 'block' }}>{[i.frequency, i.days ? `${i.days} days` : '', i.instructions].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Link className="btn small" href={`/search?q=${encodeURIComponent(i.medicine)}`}>Find</Link>
                </li>
              ))}
            </ol>
          ) : null}
          {rx.advice ? <p className="small" style={{ margin: 0 }}><span className="muted">Advice: </span>{rx.advice}</p> : null}
          {rx.followUpDays ? (
            <div className="notice row between" style={{ gap: 10 }}>
              <span>Follow up in {rx.followUpDays} days</span>
              <Link className="btn small primary" href="/doctors">Book again</Link>
            </div>
          ) : null}
        </div>
      ) : b.status === 'COMPLETED' ? (
        <p className="muted small">The doctor has not added a prescription for this call.</p>
      ) : null}
    </div>
  );
}
