'use client';

import { formatTk } from '@albarakah/domain';
import { fmtWhen } from '@albarakah/ui';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { message, statusLabel } from '@/lib/app';

interface Row {
  id: string;
  code: string;
  startsAt: string;
  status: string;
  channel: string;
  feePoisha: number;
  customer: { name: string; phone: string };
  doctor: { user: { name: string } };
}

export default function AdminConsultationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void api
      .get<Row[]>('/admin/consultations')
      .then(setRows)
      .catch((err) => setError(message(err)));
  }, []);

  return (
    <div className="page stack">
      <h1 className="title">Consultations</h1>
      {error ? <p className="error">{error}</p> : null}
      <div className="stack">
        {rows.map((r) => (
          <div key={r.id} className="card stack">
            <span className="row between">
              <strong>{fmtWhen(r.startsAt)}</strong>
              <span className="chip">{statusLabel(r.status)}</span>
            </span>
            <span>
              {r.customer.name} with {r.doctor.user.name}
            </span>
            <span className="muted small">
              {r.code} · {statusLabel(r.channel)} · {formatTk(r.feePoisha)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
