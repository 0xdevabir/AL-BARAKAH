'use client';

import { fmtWhen, statusLabel, statusTone } from '@albarakah/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Row {
  id: string;
  startsAt: string;
  status: string;
  channel: string;
  doctor: { user: { name: string } };
}

export default function BookingsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      if (!api.ready) await api.restore();
      if (!api.user) {
        router.replace('/login?next=/doctors/bookings');
        return;
      }
      try {
        setRows(await api.get<Row[]>('/consultations'));
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [router]);

  return (
    <div className="page">
      <Link className="btn ghost small" href="/doctors" style={{ paddingLeft: 0 }}>
        ‹ Doctors
      </Link>
      <h1 className="title">My bookings</h1>
      {error ? <p className="error">{error}</p> : null}
      {rows && rows.length === 0 ? (
        <div className="empty">
          <p>No consultations yet.</p>
          <Link className="btn primary" href="/doctors">
            Find a doctor
          </Link>
        </div>
      ) : null}
      {rows && rows.length > 0 ? (
        <div className="group">
          {rows.map((r) => (
            <Link key={r.id} className="chev" href={`/doctors/bookings/${r.id}`}>
              <span className="grow">
                <strong>{r.doctor.user.name}</strong>
                <span className="muted small" style={{ display: 'block' }}>{fmtWhen(r.startsAt)}</span>
              </span>
              <span className={`chip ${statusTone(r.status)}`}>{statusLabel(r.status)}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {!rows && !error ? <p className="muted">Loading…</p> : null}
    </div>
  );
}
