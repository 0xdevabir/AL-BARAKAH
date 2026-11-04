'use client';

import { formatTk } from '@albarakah/domain';
import { fmtWhen } from '@albarakah/ui';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Booking {
  id: string;
  startsAt: string;
  status: string;
  channel: string;
  feePoisha: number;
  reason?: string | null;
  meetLink?: string | null;
  doctor: { user: { name: string }; specialty: string };
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      if (!api.ready) await api.restore();
      if (!api.user) {
        router.replace(`/login?next=/doctors/bookings/${id}`);
        return;
      }
      try {
        setB(await api.get<Booking>(`/consultations/${id}`));
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [id, router]);

  return (
    <div className="page stack">
      <Link className="btn ghost small" href="/doctors/bookings" style={{ paddingLeft: 0 }}>
        ‹ Bookings
      </Link>
      {error ? <p className="error">{error}</p> : null}
      {b ? (
        <>
          <h1 className="title">{b.doctor.user.name}</h1>
          <p className="muted">{b.doctor.specialty}</p>
          <div className="card">{fmtWhen(b.startsAt)}</div>
          <div className="group">
            <div className="row between"><span className="muted">Status</span><span className="chip">{b.status}</span></div>
            <div className="row between"><span className="muted">Channel</span><span>{b.channel === 'GOOGLE_MEET' ? 'Google Meet' : 'WhatsApp'}</span></div>
            <div className="row between"><span className="muted">Fee</span><span className="price">{formatTk(b.feePoisha)}</span></div>
          </div>
          {b.reason ? <p>{b.reason}</p> : null}
          {b.meetLink ? (
            <a className="btn primary block" href={b.meetLink} target="_blank" rel="noreferrer">
              Join call
            </a>
          ) : null}
        </>
      ) : !error ? (
        <p className="muted">Loading…</p>
      ) : null}
    </div>
  );
}
