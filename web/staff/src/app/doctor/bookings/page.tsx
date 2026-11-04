'use client';

import { EmptyState, fmtDay, fmtTime, LargeTitle, SearchField, Segmented, SkeletonList, statusLabel, statusTone } from '@albarakah/ui';
import { useDeferredValue, useMemo, useState } from 'react';
import { BookingSheet } from '@/components/Consult';
import { Icon } from '@/components/Icon';
import { useGet } from '@/lib/api';
import { type Booking, canClose, CHANNEL } from '@/lib/doctor';

export default function DoctorBookings() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim().toLowerCase());
  const { data, pending } = useGet<Booking[]>(`/doctor/bookings?scope=${scope}`, { pollMs: scope === 'upcoming' ? 60_000 : undefined });
  const [open, setOpen] = useState<Booking | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of data ?? []) {
      if (query && !`${b.customer.name} ${b.code} ${b.patientPhone} ${b.reason ?? ''} ${b.prescription?.diagnosis ?? ''}`.toLowerCase().includes(query)) continue;
      const k = fmtDay(b.startsAt);
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return [...m];
  }, [data, query]);
  const toClose = scope === 'upcoming' ? (data ?? []).filter((b) => new Date(b.endsAt).getTime() < Date.now()).length : 0;

  return (
    <>
      <LargeTitle>Bookings</LargeTitle>
      <div className="stack">
        <Segmented label="Bookings" value={scope} onChange={setScope} options={[{ value: 'upcoming', label: 'Upcoming', badge: toClose || undefined }, { value: 'past', label: 'Past' }]} />
        <SearchField value={q} onChange={setQ} placeholder="Patient, phone, diagnosis" />
      </div>
      {toClose ? <p className="notice" style={{ marginTop: 12 }}>{toClose} finished {toClose === 1 ? 'visit needs' : 'visits need'} closing — complete or mark no-show.</p> : null}
      {pending ? <SkeletonList rows={5} /> : null}
      {data && !groups.length ? <EmptyState icon="📅" title={query ? 'No matches' : scope === 'upcoming' ? 'No upcoming bookings' : 'No past visits yet'} /> : null}
      {groups.map(([day, rows]) => (
        <section key={day}>
          <p className="group-label">{day}</p>
          <div className="group cv">
            {rows.map((b) => (
              <button key={b.id} className="press" onClick={() => setOpen(b)}>
                <span className="cell-icon"><Icon name={b.channel === 'GOOGLE_MEET' ? 'video' : 'phone'} size={18} /></span>
                <span className="cell-main">
                  <strong>{fmtTime(b.startsAt)} · {b.customer.name || 'Patient'}</strong>
                  <span className="cell-sub">{b.prescription?.diagnosis || b.reason || CHANNEL[b.channel]} · {b.code}</span>
                </span>
                {b.status === 'CONFIRMED' && canClose(b) && new Date(b.endsAt).getTime() < Date.now() ? (
                  <span className="chip warn">To close</span>
                ) : (
                  <span className={`chip ${statusTone(b.status)}`}>{statusLabel(b.status)}</span>
                )}
                <span className="chev" />
              </button>
            ))}
          </div>
        </section>
      ))}
      <BookingSheet booking={open} onClose={() => setOpen(null)} />
    </>
  );
}
