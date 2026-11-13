'use client';

import { formatTk } from '@albarakah/domain';
import { EmptyState, fmtTime, fmtWhen, LargeTitle, Segmented, SkeletonList, StatTile, statusLabel, statusTone } from '@albarakah/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { QueueList } from '@/components/DoctorQueue';
import { useGet } from '@/lib/api';
import { pct } from '@/lib/app';
import { type Booking, CHANNEL, type DoctorMe, type DoctorSummary, type QueueItem, TIER, WEEKDAYS } from '@/lib/doctor';

interface Portal {
  doctor: DoctorMe & { tier: 'SPECIALIST' | 'INTERN'; onDuty: boolean };
  summary: DoctorSummary;
  queue: QueueItem[];
  bookings: Booking[];
}

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** What the doctor sees in their portal, read-only. Opening it is recorded in the audit log. */
export default function DoctorPortalView() {
  const { id } = useParams<{ id: string }>();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  // Fetched once per open on purpose: every load writes an audit entry.
  const { data, error, pending } = useGet<Portal>(`/admin/doctors/${id}/portal?scope=${scope}`, { staleMs: 120_000 });
  const { data: pub } = useGet<{ instantResponseMinutes: number }>('/settings/public', { staleMs: 600_000 });

  if (error && !data) return <p className="error">{error.message}</p>;
  if (pending || !data) return <SkeletonList rows={6} />;
  const { doctor: d, summary: s, queue, bookings } = data;
  const closed = s.completedMonth + s.noShowMonth;

  return (
    <>
      <LargeTitle sub={`${TIER[d.tier]} · ${d.specialty} · BMDC ${d.bmdcNo}`} action={<Link className="btn small" href="/admin/people">Team</Link>}>
        {d.user.name}
      </LargeTitle>
      <p className="notice small">Read-only view of this doctor’s portal. Your visit is recorded in the audit log.</p>

      <div className="stats" style={{ marginTop: 12 }}>
        <StatTile label="Waiting for them" value={queue.length} tone={queue.some((q) => q.overdue) ? 'bad' : undefined} />
        <StatTile label="Today" value={s.today} hint={d.tier === 'INTERN' ? (d.onDuty ? 'On duty now' : 'Off duty') : `${d.availability.length} weekly windows`} />
        <StatTile label="Seen this month" value={s.completedMonth} hint={`${s.patients} patients in total`} />
        <StatTile label="Fees this month" value={formatTk(s.earnedMonthPoisha)} hint={closed ? `${pct(s.noShowMonth / closed)} no-show` : undefined} />
      </div>

      {queue.length ? (
        <>
          <p className="group-label">Waiting to be accepted</p>
          <QueueList items={queue} responseMinutes={pub?.instantResponseMinutes} readOnly />
        </>
      ) : null}

      {d.tier === 'SPECIALIST' ? (
        <>
          <p className="group-label">Weekly hours</p>
          {d.availability.length ? (
            <div className="group">
              {d.availability.map((w) => (
                <div key={w.id} className="cell">
                  <span className="cell-main"><span>{WEEKDAYS[w.weekday]}</span></span>
                  <span className="mono small">{hm(w.startMinute)}–{hm(w.endMinute)} · {w.slotMinutes} min</span>
                </div>
              ))}
            </div>
          ) : <p className="muted small">No hours set — patients cannot book.</p>}
        </>
      ) : null}

      <div className="toolbar" style={{ marginTop: 16 }}>
        <Segmented<'upcoming' | 'past'> label="Bookings" value={scope} onChange={setScope} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
      </div>
      {bookings.length ? (
        <div className="group cv">
          {bookings.map((b) => (
            <div key={b.id} className="cell" style={{ alignItems: 'flex-start' }}>
              <span className="cell-main">
                <strong>{b.customer.name || 'Patient'} <span className="muted small mono">{b.code}</span></strong>
                <span className="cell-sub">{fmtWhen(b.startsAt)} – {fmtTime(b.endsAt)} · {CHANNEL[b.channel]}{b.reason ? ` · “${b.reason}”` : ''}</span>
                {b.prescription?.items.length ? (
                  <span className="cell-sub">
                    ℞ {b.prescription.diagnosis ? `${b.prescription.diagnosis}: ` : ''}{b.prescription.items.map((i) => i.medicine).join(', ')}
                  </span>
                ) : null}
              </span>
              <span className={`chip ${statusTone(b.status)}`}>{statusLabel(b.status)}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon="🩺" title={scope === 'upcoming' ? 'Nothing booked' : 'No past visits'} />
      )}
    </>
  );
}
