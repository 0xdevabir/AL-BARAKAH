'use client';

import { formatTk } from '@albarakah/domain';
import { EmptyState, fmtDay, fmtTime, LargeTitle, SkeletonList, statusLabel, statusTone } from '@albarakah/ui';
import { useState } from 'react';
import { useGet } from '@/lib/api';
import type { AddressSnap } from '@/lib/types';

interface Row {
  id: string; code: string; status: 'DELIVERED' | 'FAILED'; type: string; promisedBy: string; deliveredAt: string | null; updatedAt: string;
  addressSnapshot: AddressSnap; totalPoisha: number; paymentMethod: string; riderPayoutPoisha: number; rating: number | null;
}

export default function RiderHistory() {
  const [page, setPage] = useState(1);
  const { data, pending } = useGet<Row[]>(`/delivery/history?page=${page}`);

  // Group by day, like the iOS Wallet list.
  const groups = new Map<string, Row[]>();
  for (const r of data ?? []) {
    const k = fmtDay(r.deliveredAt ?? r.updatedAt);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  return (
    <>
      <LargeTitle sub="Completed and failed runs">History</LargeTitle>
      {pending ? <SkeletonList rows={6} /> : null}
      {data && !data.length && page === 1 ? <EmptyState icon="🧾" title="No deliveries yet" /> : null}
      {[...groups].map(([day, rows]) => (
        <section key={day}>
          <p className="group-label">{day}</p>
          <div className="group">
            {rows.map((r) => {
              const at = r.deliveredAt ?? r.updatedAt;
              const onTime = r.deliveredAt && new Date(r.deliveredAt) <= new Date(r.promisedBy);
              return (
                <div key={r.id}>
                  <span className="cell-main">
                    <strong className="mono">{r.code}</strong>
                    <span className="cell-sub">
                      {fmtTime(at)} · {r.addressSnapshot.zone ?? r.addressSnapshot.line}
                      {r.status === 'DELIVERED' ? (onTime ? ' · on time' : ' · late') : ''}
                      {r.rating ? ` · ${'★'.repeat(r.rating)}` : ''}
                    </span>
                  </span>
                  <span className="cell-end">
                    <span className={`chip ${statusTone(r.status)}`}>{statusLabel(r.status)}</span>
                    {r.status === 'DELIVERED' ? <span className="small mono">+{formatTk(r.riderPayoutPoisha)}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {data && (page > 1 || data.length >= 20) ? (
        <div className="row between" style={{ marginTop: 14 }}>
          <button className="btn small" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Newer</button>
          <span className="muted small">Page {page}</span>
          <button className="btn small" disabled={data.length < 20} onClick={() => setPage((p) => p + 1)}>Older</button>
        </div>
      ) : null}
    </>
  );
}
