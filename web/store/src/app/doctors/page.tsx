'use client';

import { formatTk } from '@albarakah/domain';
import { EmptyState, SearchField, Sheet, SkeletonList } from '@albarakah/ui';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookDoctor, DoctorAvatar } from '@/components/BookDoctor';
import { useApi, useGet } from '@/lib/api';
import { CHANNEL, countdown, type Doctor, nextLine } from '@/lib/doctors';

interface Mine { id: string; startsAt: string; endsAt: string; status: string; doctor: { user: { name: string } } }

export default function DoctorsPage() {
  const { user } = useApi();
  const { data: doctors, pending, error } = useGet<Doctor[]>('/doctors', { staleMs: 60_000 });
  const { data: settings } = useGet<{ doctorBookingFeePoisha?: number }>('/settings/public', { staleMs: 600_000 });
  const { data: mine } = useGet<Mine[]>(user ? '/consultations' : null, { staleMs: 60_000 });
  const [q, setQ] = useState('');
  const [specialty, setSpecialty] = useState('All');
  const [sort, setSort] = useState<'soonest' | 'fee'>('soonest');
  const [selected, setSelected] = useState<Doctor | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const feeOf = (d: Doctor) => d.feePoisha ?? settings?.doctorBookingFeePoisha ?? 0;
  const specialties = useMemo(() => ['All', ...new Set((doctors ?? []).map((d) => d.specialty))], [doctors]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = (doctors ?? []).filter(
      (d) => (specialty === 'All' || d.specialty === specialty) && (!needle || `${d.name} ${d.specialty} ${d.bio ?? ''}`.toLowerCase().includes(needle)),
    );
    const at = (d: Doctor) => (d.nextSlot ? new Date(d.nextSlot.start).getTime() : Infinity);
    return rows.sort((a, b) => (sort === 'fee' ? feeOf(a) - feeOf(b) : at(a) - at(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors, q, specialty, sort, settings]);

  const upcoming = mine
    ?.filter((b) => b.status === 'CONFIRMED' && new Date(b.endsAt).getTime() > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  return (
    <div className="page stack screen">
      <div>
        <h1 className="title" style={{ marginBottom: 4 }}>See a doctor</h1>
        <p className="muted">BMDC-registered doctors on video or WhatsApp, with the prescription right in the app.</p>
      </div>

      {upcoming ? (
        <Link href={`/doctors/bookings/${upcoming.id}`} className="doc-upnext">
          <span className="doc-upnext-dot" aria-hidden="true" />
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="small" style={{ display: 'block', opacity: 0.8 }}>Your next consultation</span>
            <strong className="ellipsis" style={{ display: 'block' }}>{upcoming.doctor.user.name}</strong>
          </span>
          <span className="doc-upnext-when">{new Date(upcoming.startsAt).getTime() <= now ? 'Now' : `in ${countdown(new Date(upcoming.startsAt).getTime() - now)}`}</span>
        </Link>
      ) : null}

      <ol className="how-strip" aria-label="How it works">
        <li><b>1</b><span>Pick a time</span></li>
        <li><b>2</b><span>Pay with bKash</span></li>
        <li><b>3</b><span>Talk &amp; get your ℞</span></li>
      </ol>

      <SearchField value={q} onChange={setQ} placeholder="Search doctors or specialty" />
      {specialties.length > 2 ? (
        <div className="chips" style={{ marginTop: 0 }}>
          {specialties.map((s) => (
            <button key={s} type="button" className={`btn small${specialty === s ? ' primary' : ''}`} onClick={() => setSpecialty(s)}>{s}</button>
          ))}
        </div>
      ) : null}

      <div className="row between">
        <span className="muted small">{doctors ? `${list.length} doctor${list.length === 1 ? '' : 's'}` : ''}</span>
        <span className="row" style={{ gap: 6 }}>
          <button type="button" className={`chip${sort === 'soonest' ? ' live' : ''}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setSort('soonest')}>Soonest</button>
          <button type="button" className={`chip${sort === 'fee' ? ' live' : ''}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setSort('fee')}>Lowest fee</button>
        </span>
      </div>

      {error ? <p className="error">{error.message}</p> : null}
      {pending ? <SkeletonList rows={3} /> : null}
      {doctors && !list.length ? (
        <EmptyState icon="🩺" title={doctors.length ? 'No doctor matches' : 'No doctors available'}>
          {doctors.length ? 'Try another name or specialty.' : 'Please check back soon.'}
        </EmptyState>
      ) : null}

      <div className="doc-list stagger">
        {list.map((d) => (
          <article key={d.id} className="doc-card">
            <button type="button" className="doc-card-main" onClick={() => setSelected(d)}>
              <DoctorAvatar d={d} />
              <span className="grow" style={{ minWidth: 0 }}>
                <strong className="doc-name">{d.name}</strong>
                <span className="doc-spec">{d.specialty}</span>
                <span className="doc-meta">
                  <span title="Verified with the Bangladesh Medical & Dental Council">✓ BMDC {d.bmdcNo}</span>
                  {d.consultations ? <span>{d.consultations} consults</span> : null}
                  {d.channels.map((c) => <span key={c} aria-label={CHANNEL[c].label}>{CHANNEL[c].icon}</span>)}
                </span>
              </span>
            </button>
            {d.bio ? <p className="doc-bio">{d.bio}</p> : null}
            <div className="doc-foot">
              <span className="grow" style={{ minWidth: 0 }}>
                {d.nextSlot ? (
                  <>
                    <span className="doc-next on">● Next free</span>
                    <strong className="ellipsis" style={{ display: 'block' }}>{nextLine(d.nextSlot, now)}</strong>
                  </>
                ) : (
                  <span className="doc-next">No free times this week</span>
                )}
              </span>
              <span className="price">{formatTk(feeOf(d))}</span>
              <button type="button" className="btn primary small" disabled={!d.nextSlot} onClick={() => setSelected(d)}>Book</button>
            </div>
          </article>
        ))}
      </div>

      <Link className="btn block" href="/doctors/bookings">My consultations &amp; prescriptions</Link>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title="Book a consultation">
        {selected ? <BookDoctor key={selected.id} doctor={selected} fee={feeOf(selected)} /> : null}
      </Sheet>
    </div>
  );
}
