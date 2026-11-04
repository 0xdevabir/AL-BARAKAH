'use client';

import { EmptyState, fmtTime, Segmented, SkeletonList, statusLabel, statusTone } from '@albarakah/ui';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useGet } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { CHANNEL, type Channel, countdown, dayName } from '@/lib/doctors';

interface Row {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  channel: Channel;
  doctor: { specialty: string; user: { name: string } };
}

export default function BookingsPage() {
  const user = useSignedIn('/doctors/bookings');
  const { data: rows, error, pending } = useGet<Row[]>(user ? '/consultations' : null, { pollMs: 60_000 });
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [upcoming, past] = useMemo(() => {
    const up: Row[] = [];
    const done: Row[] = [];
    for (const r of rows ?? []) {
      const live = ['CONFIRMED', 'HOLD'].includes(r.status) && new Date(r.endsAt).getTime() > now;
      (live ? up : done).push(r);
    }
    up.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return [up, done];
  }, [rows, now]);
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="page stack screen">
      <Link className="btn small back glass" href="/doctors">‹ Doctors</Link>
      <h1 className="title">Consultations</h1>
      <Segmented
        label="Bookings"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: `Upcoming${upcoming.length ? ` · ${upcoming.length}` : ''}` },
          { value: 'past', label: 'Past & prescriptions' },
        ]}
      />
      {error ? <p className="error">{error.message}</p> : null}
      {pending ? <SkeletonList rows={3} /> : null}
      {rows && !shown.length ? (
        <EmptyState
          icon={tab === 'upcoming' ? '🗓️' : '℞'}
          title={tab === 'upcoming' ? 'Nothing coming up' : 'No past consultations'}
          action={<Link className="btn primary" href="/doctors">Find a doctor</Link>}
        >
          {tab === 'upcoming' ? 'Book a doctor and the call shows up here with a countdown.' : 'Prescriptions from your calls are kept here.'}
        </EmptyState>
      ) : null}

      <div className="stack stagger" style={{ gap: 10 }}>
        {shown.map((r) => {
          const d = new Date(r.startsAt);
          const ms = d.getTime() - now;
          const soon = r.status === 'CONFIRMED' && ms < 10 * 60_000;
          return (
            <Link key={r.id} href={`/doctors/bookings/${r.id}`} className={`bk-card${soon ? ' soon' : ''}`}>
              <span className="bk-date" aria-hidden="true">
                <span>{d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'Asia/Dhaka' })}</span>
                <strong>{d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Dhaka' })}</strong>
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <strong className="ellipsis" style={{ display: 'block' }}>{r.doctor.user.name}</strong>
                <span className="muted small" style={{ display: 'block' }}>{r.doctor.specialty} · {CHANNEL[r.channel].icon} {CHANNEL[r.channel].label}</span>
                <span className="small" style={{ display: 'block', marginTop: 2 }}>
                  {dayName(r.startsAt, now)}, {fmtTime(r.startsAt)}
                  {tab === 'upcoming' && r.status === 'CONFIRMED' ? <b className="bk-in"> · {ms <= 0 ? 'happening now' : `in ${countdown(ms)}`}</b> : null}
                </span>
              </span>
              {soon ? <span className="chip live">Join</span> : <span className={`chip ${statusTone(r.status)}`}>{statusLabel(r.status)}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
