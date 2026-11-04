'use client';

import { formatTk } from '@albarakah/domain';
import { EmptyState, fmtTime, LargeTitle, SkeletonList, StatTile } from '@albarakah/ui';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookingSheet } from '@/components/Consult';
import { Icon } from '@/components/Icon';
import { useApi, useGet } from '@/lib/api';
import { pct } from '@/lib/app';
import { type Booking, CHANNEL, type DoctorMe, type DoctorSummary, joinLink } from '@/lib/doctor';

function countdown(ms: number) {
  if (ms <= 0) return 'Now';
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min` : `${Math.round(h / 24)} days`;
}

const dhakaDay = (d: string | number | Date) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

export default function DoctorToday() {
  const { user } = useApi();
  const { data: s } = useGet<DoctorSummary>('/doctor/summary', { pollMs: 120_000 });
  const { data: me } = useGet<DoctorMe>('/doctor/me', { staleMs: 300_000 });
  const { data: upcoming, pending } = useGet<Booking[]>('/doctor/bookings?scope=upcoming', { pollMs: 60_000 });
  const [open, setOpen] = useState<Booking | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const today = useMemo(() => {
    const d = dhakaDay(now);
    return (upcoming ?? []).filter((b) => dhakaDay(b.startsAt) === d);
  }, [upcoming, now]);
  const next = upcoming?.find((b) => new Date(b.endsAt).getTime() >= now) ?? null;
  const toStart = next ? new Date(next.startsAt).getTime() - now : 0;
  const inCall = next && toStart <= 0;
  const join = next ? joinLink(next.channel, me, next.patientPhone) : null;
  const hour = Number(new Date(now).toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Dhaka' }));
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const closed = s ? s.completedMonth + s.noShowMonth : 0;

  return (
    <>
      <LargeTitle sub={`${hello}${user ? `, ${user.name.replace(/^Dr\.?\s*/i, 'Dr. ')}` : ''}`}>Today</LargeTitle>

      {s && !s.hasAvailability ? (
        <Link href="/doctor/availability" className="notice bad row" style={{ gap: 10 }}>
          <Icon name="clock" size={18} /> <span className="grow">Patients cannot book you until you set your hours.</span> ›
        </Link>
      ) : null}

      {next ? (
        <div className="hero-card" style={{ marginTop: 12 }}>
          <span className="muted small">{inCall ? 'In progress' : 'Next patient'} · {CHANNEL[next.channel]}</span>
          <div className="big-num">{inCall ? 'Now' : countdown(toStart)}</div>
          <strong>{next.customer.name || 'Patient'}</strong>
          <span className="muted small" style={{ display: 'block' }}>
            {fmtTime(next.startsAt)} – {fmtTime(next.endsAt)}{next.reason ? ` · ${next.reason}` : ''}
          </span>
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => setOpen(next)}>Open</button>
            {join ? <a className="btn primary" href={join} target="_blank" rel="noreferrer"><Icon name="video" size={18} /> Join</a> : null}
          </div>
        </div>
      ) : null}

      {s ? (
        <div className="stats" style={{ marginTop: 14 }}>
          <StatTile label="Today" value={s.today} hint="booked" />
          <StatTile label="Seen this month" value={s.completedMonth} />
          <StatTile label="Earned this month" value={formatTk(s.earnedMonthPoisha)} />
          <StatTile label="No-show rate" value={closed ? pct(s.noShowMonth / closed) : '—'} tone={closed && s.noShowMonth / closed > 0.2 ? 'warn' : undefined} hint={`${s.patients} patients`} />
        </div>
      ) : null}

      <p className="group-label">Schedule</p>
      {pending ? <SkeletonList rows={4} /> : null}
      {upcoming && !today.length ? <EmptyState icon="🩺" title="Nothing booked today">{upcoming.length ? `Your next booking is on ${new Date(upcoming[0]!.startsAt).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Dhaka' })}.` : 'New bookings show up here.'}</EmptyState> : null}
      {today.length ? (
        <div className="group stagger">
          {today.map((b) => {
            const past = new Date(b.endsAt).getTime() < now;
            const nowOn = !past && new Date(b.startsAt).getTime() <= now;
            return (
              <button key={b.id} className="press" onClick={() => setOpen(b)} style={past ? { opacity: 0.6 } : undefined}>
                <span className={`cell-icon${nowOn ? ' live' : ''}`}><Icon name={b.channel === 'GOOGLE_MEET' ? 'video' : 'phone'} size={18} /></span>
                <span className="cell-main">
                  <strong>{fmtTime(b.startsAt)} · {b.customer.name || 'Patient'}</strong>
                  <span className="cell-sub">{b.reason || CHANNEL[b.channel]}</span>
                </span>
                {nowOn ? <span className="chip live">Now</span> : past ? <span className="chip warn">To close</span> : null}
                <span className="chev" />
              </button>
            );
          })}
        </div>
      ) : null}

      <BookingSheet booking={open} onClose={() => setOpen(null)} />
    </>
  );
}
