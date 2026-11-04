'use client';

import { formatTk } from '@albarakah/domain';
import { EmptyState, fmtWhen, LargeTitle, SkeletonList, StatTile } from '@albarakah/ui';
import { useGet } from '@/lib/api';
import type { Ledger } from '@/lib/types';

const LABEL = { EARNING: 'Delivery earning', COD_COLLECTED: 'Cash collected', SETTLEMENT: 'Handed in to office' } as const;

export default function RiderEarnings() {
  const { data: l, pending } = useGet<Ledger>('/delivery/ledger');
  return (
    <>
      <LargeTitle sub="Your payouts and the cash you carry">Earnings</LargeTitle>
      {pending ? <SkeletonList rows={5} /> : null}
      {l ? (
        <>
          <div className="hero-card">
            <span className="muted small">Cash to hand in</span>
            <div className="big-num">{formatTk(l.cashHeldPoisha)}</div>
            <span className="muted small">{l.cashHeldPoisha > 0 ? 'Drop this at the office at the end of your shift.' : 'You are all settled up.'}</span>
          </div>
          <div className="stats" style={{ marginTop: 14 }}>
            <StatTile label="Total earned" value={formatTk(l.earnedPoisha)} />
            <StatTile label="Cash collected" value={formatTk(l.codCollectedPoisha)} />
            <StatTile label="Handed in" value={formatTk(l.settledPoisha)} />
          </div>
          <p className="group-label">Activity</p>
          {l.entries.length ? (
            <div className="group cv">
              {l.entries.map((e) => (
                <div key={e.id}>
                  <span className={`cell-icon${e.type === 'COD_COLLECTED' ? ' warn' : e.type === 'SETTLEMENT' ? '' : ' live'}`}>
                    {e.type === 'EARNING' ? '+' : e.type === 'SETTLEMENT' ? '✓' : '৳'}
                  </span>
                  <span className="cell-main">
                    <strong>{LABEL[e.type]}{e.order ? ` · ${e.order.code}` : ''}</strong>
                    <span className="cell-sub">{fmtWhen(e.createdAt)}{e.note ? ` · ${e.note}` : ''}</span>
                  </span>
                  <span className="mono">{formatTk(e.amountPoisha)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="💰" title="No activity yet">Earnings appear here after your first delivery.</EmptyState>
          )}
        </>
      ) : null}
    </>
  );
}
