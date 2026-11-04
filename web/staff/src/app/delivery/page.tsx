'use client';

import { formatTk } from '@albarakah/domain';
import { fmtWhen } from '@albarakah/ui';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { message } from '@/lib/app';

interface Job {
  id: string;
  code: string;
  status: 'ASSIGNED' | 'OUT_FOR_DELIVERY';
  type: string;
  promisedBy: string;
  totalPoisha: number;
  paymentMethod: string;
  paymentStatus: string;
  notes: string | null;
  addressSnapshot: { label: string; line: string; phone: string; notes?: string; zone: string };
  customer: { name: string };
  items: { nameSnapshot: string; qty: number }[];
}

export default function DeliveryJobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setJobs(await api.get<Job[]>('/delivery/jobs'));
    } catch (err) {
      setError(message(err));
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const collect = (j: Job) => j.paymentMethod === 'COD' && j.paymentStatus !== 'PAID';

  async function move(job: Job, to: string) {
    let note: string | undefined;
    if (to === 'FAILED') {
      const reason = prompt('Why could the delivery not be completed?');
      if (reason === null) return;
      note = reason.trim() || undefined;
    }
    if (to === 'DELIVERED' && collect(job) && !confirm(`Did you collect ${formatTk(job.totalPoisha)} in cash?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/delivery/jobs/${job.id}/status`, { to, ...(note ? { note } : {}) });
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack">
      <h1 className="title">Jobs</h1>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {jobs?.length === 0 ? <p className="empty">No deliveries assigned to you right now</p> : null}
      {(jobs ?? []).map((j) => (
        <article key={j.id} className="card stack">
          <div className="row wrap">
            <strong className="mono small">{j.code}</strong>
            {j.type === 'EMERGENCY' ? <span className="chip warn">Emergency</span> : null}
            <span className="muted small">by {fmtWhen(j.promisedBy)}</span>
          </div>
          <div>
            <strong>{j.customer.name || j.addressSnapshot.label}</strong>
            <p>{j.addressSnapshot.line}</p>
            <p className="muted small">
              {j.addressSnapshot.zone}
              {j.addressSnapshot.notes ? ` · ${j.addressSnapshot.notes}` : ''}
            </p>
            {j.notes ? <p className="small">Note: {j.notes}</p> : null}
          </div>
          <p className="small">{j.items.map((i) => `${i.nameSnapshot} × ${i.qty}`).join(', ')}</p>
          <p className="collect">
            {collect(j) ? (
              <>
                Collect <strong className="mono">{formatTk(j.totalPoisha)}</strong> cash
              </>
            ) : (
              'Already paid, collect nothing'
            )}
          </p>
          <div className="row wrap">
            <a className="btn" href={`tel:${j.addressSnapshot.phone}`}>
              Call customer
            </a>
            {j.status === 'ASSIGNED' ? (
              <button className="btn primary grow" type="button" disabled={busy} onClick={() => void move(j, 'OUT_FOR_DELIVERY')}>
                Start delivery
              </button>
            ) : (
              <>
                <button className="btn danger" type="button" disabled={busy} onClick={() => void move(j, 'FAILED')}>
                  Failed
                </button>
                <button className="btn primary grow" type="button" disabled={busy} onClick={() => void move(j, 'DELIVERED')}>
                  Delivered
                </button>
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
