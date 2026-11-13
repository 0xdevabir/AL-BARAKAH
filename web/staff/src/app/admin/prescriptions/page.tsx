'use client';

import { EmptyState, fmtWhen, LargeTitle, SkeletonList, toast } from '@albarakah/ui';
import { useState } from 'react';
import { useGet } from '@/lib/api';
import { printRx } from '@/lib/doctor';
import type { Rx } from '@/lib/types';

interface Row {
  id: string;
  code: string;
  kind: 'SCHEDULED' | 'INSTANT';
  prescribedAt: string | null;
  startsAt: string;
  prescription: Rx | null;
  patientPhone: string;
  customer: { name: string };
  doctor: { bmdcNo: string; specialty: string; user: { name: string } };
}

const PAGE = 50;

/** Every prescription doctors have written, newest first. A copy of each also lands in the admins' inbox and email. */
export default function PrescriptionsPage() {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, pending } = useGet<Row[]>(`/admin/prescriptions?page=${page}`, { staleMs: 30_000 });

  return (
    <>
      <LargeTitle sub="Written by your doctors after each visit">Prescriptions</LargeTitle>
      {error && !data ? <p className="error">{error.message}</p> : null}
      {pending && !data ? <SkeletonList rows={6} /> : null}
      {data && !data.length ? <EmptyState icon="℞" title={page ? 'No more prescriptions' : 'No prescriptions yet'} /> : null}

      {data?.length ? (
        <div className="group cv">
          {data.map((r) => {
            const rx = r.prescription;
            const patient = r.customer.name || r.patientPhone;
            return (
              <div key={r.id} className="cell" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <button type="button" className="rx-row" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <span className="cell-main">
                    <strong>{patient} <span className="muted small mono">{r.code}</span></strong>
                    <span className="cell-sub">
                      {r.doctor.user.name} · {r.doctor.specialty} · {fmtWhen(r.prescribedAt ?? r.startsAt)}{r.kind === 'INSTANT' ? ' · instant' : ''}
                    </span>
                    {rx ? <span className="cell-sub">{rx.diagnosis ? `${rx.diagnosis} — ` : ''}{rx.items.length} {rx.items.length === 1 ? 'medicine' : 'medicines'}</span> : null}
                  </span>
                  <span className="chip">{open === r.id ? 'Hide' : 'View'}</span>
                </button>
                {open === r.id && rx ? (
                  <div className="rx-sheet">
                    <ol>
                      {rx.items.map((i, n) => (
                        <li key={n}>
                          <strong>{i.medicine}</strong>{i.dose ? ` ${i.dose}` : ''}
                          <span className="muted small" style={{ display: 'block' }}>
                            {[i.frequency, i.days ? `${i.days} days` : '', i.instructions].filter(Boolean).join(' · ')}
                          </span>
                        </li>
                      ))}
                    </ol>
                    {rx.advice ? <p className="small"><strong>Advice:</strong> {rx.advice}</p> : null}
                    {rx.followUpDays ? <p className="small muted">Follow up in {rx.followUpDays} days</p> : null}
                    <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn small" onClick={() => { if (!printRx(rx, patient, r.doctor, r.prescribedAt ?? r.startsAt)) toast('Allow pop-ups to print', 'bad'); }}>
                        Print
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {data && (page > 0 || data.length === PAGE) ? (
        <div className="row between" style={{ marginTop: 14 }}>
          <button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button>
          <span className="muted small">Page {page + 1}</span>
          <button className="btn small" disabled={data.length < PAGE} onClick={() => setPage(page + 1)}>Older</button>
        </div>
      ) : null}
    </>
  );
}
