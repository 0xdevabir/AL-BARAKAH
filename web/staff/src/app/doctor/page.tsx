'use client';

import { formatTk } from '@albarakah/domain';
import { EmptyState, fmtTime, initials, LargeTitle, SkeletonList, StatTile } from '@albarakah/ui';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookingSheet } from '@/components/Consult';
import { Icon } from '@/components/Icon';
import { useApi, useGet } from '@/lib/api';
import { pct } from '@/lib/app';
import { type Booking, canClose, CHANNEL, type DoctorMe, type DoctorSummary, joinLink } from '@/lib/doctor';

function countdown(ms: number) {
  if (ms <= 0) return 'Now';
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min` : `${Math.round(h / 24)} days`;
}

const dhakaDay = (d: string | number | Date) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
const weekday = (d: string | number | Date) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Asia/Dhaka' });
const dateNum = (d: string | number | Date) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Dhaka' });

export default function DoctorToday() {
  const { user } = useApi();
  const { data: s } = useGet<DoctorSummary>('/doctor/summary', { pollMs: 120_000 });
  const { data: me } = useGet<DoctorMe>('/doctor/me', { staleMs: 300_000 });
  const { data: upcoming, pending } = useGet<Booking[]>('/doctor/bookings?scope=upcoming', { pollMs: 60_000 });
  const [open, setOpen] = useState<Booking | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [day, setDay] = useState(() => dhakaDay(Date.now()));
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const todayKey = dhakaDay(now);
  // A week at a glance: the next 7 days with how many patients each.
  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const at = now + i * 86_400_000;
        const key = dhakaDay(at);
        return { key, at, count: (upcoming ?? []).filter((b) => dhakaDay(b.startsAt) === key).length };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upcoming, todayKey],
  );
  const agenda = useMemo(() => (upcoming ?? []).filter((b) => dhakaDay(b.startsAt) === day), [upcoming, day]);
  const toClose = (upcoming ?? []).filter((b) => new Date(b.endsAt).getTime() < now);
  const next = upcoming?.find((b) => new Date(b.endsAt).getTime() >= now) ?? null;
  const toStart = next ? new Date(next.startsAt).getTime() - now : 0;
  const inCall = next && toStart <= 0;
  const join = next ? joinLink(next.channel, me, next.patientPhone) : null;
  const hour = Number(new Date(now).toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Dhaka' }));
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const closed = s ? s.completedMonth + s.noShowMonth : 0;
  const leftToday = (upcoming ?? []).filter((b) => dhakaDay(b.startsAt) === todayKey && new Date(b.endsAt).getTime() >= now).length;
  const nextStep = !next ? -1 : inCall ? (canClose(next, now) ? 2 : 1) : toStart < 15 * 60_000 ? 1 : 0;

  return (
    <>
      <LargeTitle sub={`${hello}${user ? `, ${user.name.replace(/^Dr\.?\s*/i, 'Dr. ')}` : ''}`}>Today</LargeTitle>

      {s && !s.hasAvailability ? (
        <Link href="/doctor/availability" className="notice bad row" style={{ gap: 10 }}>
          <Icon name="clock" size={18} /> <span className="grow">Patients cannot book you until you set your hours.</span> ›
        </Link>
      ) : null}
      {toClose.length ? (
        <button type="button" className="notice row press" style={{ gap: 10, width: '100%', marginTop: 10 }} onClick={() => setOpen(toClose[0]!)}>
          <Icon name="doc" size={18} />
          <span className="grow" style={{ textAlign: 'left' }}>{toClose.length === 1 ? '1 visit needs closing' : `${toClose.length} visits need closing`} — write the ℞ or mark no-show</span> ›
        </button>
      ) : null}

      {next ? (
        <div className={`hero-card next-hero${inCall ? ' live' : ''}`} style={{ marginTop: 12 }}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <span>
              <span className="muted small">{inCall ? 'In progress' : 'Next patient'} · {CHANNEL[next.channel]}</span>
              <div className="big-num">{inCall ? 'Now' : countdown(toStart)}</div>
            </span>
            <span className="hero-avatar" aria-hidden="true">{initials(next.customer.name || 'P')}</span>
          </div>
          <strong>{next.customer.name || 'Patient'}</strong>
          <span className="muted small" style={{ display: 'block' }}>
            {fmtTime(next.startsAt)} – {fmtTime(next.endsAt)}{next.reason ? ` · “${next.reason}”` : ''}
          </span>
          <ol className="hero-steps" aria-label="Steps">
            {['Review', 'Join call', 'Write ℞'].map((t, i) => (
              <li key={t} className={i < nextStep ? 'done' : i === nextStep ? 'now' : undefined}>{i < nextStep ? '✓ ' : ''}{t}</li>
            ))}
          </ol>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setOpen(next)}>{nextStep === 2 ? 'Write ℞' : 'Open'}</button>
            {join ? <a className="btn primary" href={join} target="_blank" rel="noreferrer"><Icon name="video" size={18} /> Join</a> : null}
          </div>
        </div>
      ) : null}

      {s ? (
        <div className="stats" style={{ marginTop: 14 }}>
          <StatTile label="Left today" value={leftToday} hint={`${s.today} booked`} />
          <StatTile label="Seen this month" value={s.completedMonth} />
          <StatTile label="Earned this month" value={formatTk(s.earnedMonthPoisha)} />
          <StatTile label="No-show rate" value={closed ? pct(s.noShowMonth / closed) : '—'} tone={closed && s.noShowMonth / closed > 0.2 ? 'warn' : undefined} hint={`${s.patients} patients`} />
        </div>
      ) : null}

      <p className="group-label">Schedule</p>
      <div className="week-strip" role="tablist" aria-label="Day">
        {week.map((w, i) => (
          <button key={w.key} type="button" role="tab" aria-selected={day === w.key} className={`week-day${day === w.key ? ' on' : ''}`} onClick={() => setDay(w.key)}>
            <span>{i === 0 ? 'Today' : weekday(w.at)}</span>
            <strong>{dateNum(w.at)}</strong>
            <i className={w.count ? 'has' : undefined}>{w.count || '·'}</i>
          </button>
        ))}
      </div>

      {pending ? <SkeletonList rows={4} /> : null}
      {upcoming && !agenda.length ? (
        <EmptyState icon="🩺" title={day === todayKey ? 'Nothing booked today' : 'Nothing booked this day'}>
          {upcoming.length ? 'Pick another day above to see your bookings.' : 'New bookings show up here.'}
        </EmptyState>
      ) : null}
      {agenda.length ? (
        <ol className="agenda stagger">
          {agenda.map((b, i) => {
            const past = new Date(b.endsAt).getTime() < now;
            const nowOn = !past && new Date(b.startsAt).getTime() <= now;
            // Draw the "now" line before the first visit that has not started yet.
            const nowLine = day === todayKey && !nowOn && !past && (i === 0 || new Date(agenda[i - 1]!.endsAt).getTime() < now);
            return (
              <li key={b.id} className={`${past ? 'past' : ''}${nowOn ? ' on' : ''}`}>
                {nowLine ? <span className="agenda-now" aria-label="Now"><b>{fmtTime(new Date(now))}</b></span> : null}
                <span className="agenda-time">{fmtTime(b.startsAt)}</span>
                <button type="button" className="agenda-card press" onClick={() => setOpen(b)}>
                  <span className={`cell-icon${nowOn ? ' live' : ''}`}><Icon name={b.channel === 'GOOGLE_MEET' ? 'video' : 'phone'} size={18} /></span>
                  <span className="cell-main">
                    <strong>{b.customer.name || 'Patient'}</strong>
                    <span className="cell-sub">{b.reason || CHANNEL[b.channel]} · until {fmtTime(b.endsAt)}</span>
                  </span>
                  {nowOn ? <span className="chip live">Now</span> : past ? <span className="chip warn">To close</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}

      <BookingSheet booking={open} onClose={() => setOpen(null)} />
    </>
  );
}
