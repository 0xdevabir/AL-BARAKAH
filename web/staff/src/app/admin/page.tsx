'use client';

import { formatTk } from '@albarakah/domain';
import { AreaChart, BarList, EmptyState, fmtRelative, fmtShortDay, LargeTitle, Segmented, SkeletonList, StatTile, statusLabel } from '@albarakah/ui';
import Link from 'next/link';
import { useState } from 'react';
import { useGet } from '@/lib/api';
import { pct } from '@/lib/app';
import type { Dashboard } from '@/lib/types';

type Range = '7' | '14' | '30' | '90';

export default function AdminDashboard() {
  const [days, setDays] = useState<Range>('7');
  const { data, error, pending, refetch } = useGet<Dashboard>(`/admin/dashboard?days=${days}`, { pollMs: 60_000, staleMs: 20_000 });
  const k = data?.kpis;

  return (
    <>
      <LargeTitle
        sub={data ? `Updated ${fmtRelative(data.generatedAt)}` : 'Store performance at a glance'}
        action={
          <button className="btn small" onClick={() => void refetch()}>
            Refresh
          </button>
        }
      >
        Dashboard
      </LargeTitle>

      <div className="toolbar">
        <Segmented<Range>
          label="Range"
          value={days}
          onChange={setDays}
          options={[
            { value: '7', label: '7 days' },
            { value: '14', label: '14 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
        />
      </div>

      {error && !data ? <p className="error">{error.message}</p> : null}
      {pending ? <SkeletonList rows={6} /> : null}

      {k && data ? (
        <div className="stack stagger">
          {k.lateNow || k.pendingRx || k.refundsNeeded ? (
            <div className="group">
              {k.lateNow ? (
                <Link href="/admin/orders?late=1" className="chev">
                  <span className="cell-icon bad">!</span>
                  <span className="cell-main">
                    <strong>{k.lateNow} late {k.lateNow === 1 ? 'order' : 'orders'}</strong>
                    <span className="cell-sub">Past their promised time and still open</span>
                  </span>
                </Link>
              ) : null}
              {k.pendingRx ? (
                <Link href="/admin/orders?status=PLACED" className="chev">
                  <span className="cell-icon warn">Rx</span>
                  <span className="cell-main">
                    <strong>{k.pendingRx} prescriptions to check</strong>
                    <span className="cell-sub">Orders waiting for a pharmacist</span>
                  </span>
                </Link>
              ) : null}
              {k.refundsNeeded ? (
                <Link href="/admin/consultations" className="chev">
                  <span className="cell-icon warn">৳</span>
                  <span className="cell-main">
                    <strong>{k.refundsNeeded} refunds due</strong>
                    <span className="cell-sub">Paid for, but the order or consultation never happened</span>
                  </span>
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="stats">
            <StatTile label="Revenue" value={formatTk(k.revenuePoisha)} delta={k.revenueChange} />
            <StatTile label="Orders" value={k.orders} delta={k.ordersChange} />
            <StatTile label="Average order" value={formatTk(k.avgOrderPoisha)} />
            <StatTile label="New customers" value={k.newCustomers} delta={k.newCustomersChange} />
            <StatTile label="Today" value={formatTk(k.todayRevenuePoisha)} hint={`${k.todayOrders} orders`} />
            <StatTile label="Cancel rate" value={pct(k.cancelRate)} tone={k.cancelRate > 0.1 ? 'warn' : undefined} />
            <StatTile label="Rating" value={k.rating ? `${k.rating.toFixed(1)} ★` : '—'} hint={`${k.ratingCount} reviews`} />
            <StatTile label="Cash with riders" value={formatTk(k.cashWithRidersPoisha)} tone={k.cashWithRidersPoisha > 2_000_000 ? 'warn' : undefined} />
          </div>

          <div className="cols main-side">
            <div className="panel">
              <div className="panel-title">
                Delivered revenue <span className="muted">per day</span>
              </div>
              <AreaChart label="Delivered revenue per day" format={formatTk} points={data.series.map((s) => ({ x: fmtShortDay(s.date), y: s.revenuePoisha }))} />
            </div>
            <div className="panel">
              <div className="panel-title">
                Orders <span className="muted">by status</span>
              </div>
              <BarList
                items={Object.entries(data.byStatus)
                  .sort((a, b) => b[1] - a[1])
                  .map(([s, n]) => ({ label: statusLabel(s), value: n }))}
              />
            </div>
          </div>

          <div className="cols two">
            <div className="panel">
              <div className="panel-title">
                Best sellers <span className="muted">units</span>
              </div>
              {data.topMedicines.length ? (
                <BarList items={data.topMedicines.map((m) => ({ label: m.name, value: m.qty, sub: formatTk(m.revenuePoisha) }))} />
              ) : (
                <p className="muted small">No sales in this range yet.</p>
              )}
            </div>
            <div className="panel">
              <div className="panel-title">
                Late right now <Link href="/admin/orders?late=1" className="muted">All</Link>
              </div>
              {data.late.length ? (
                data.late.map((o) => (
                  <Link key={o.id} href={`/admin/orders?open=${o.id}`} className="line-item">
                    <span>
                      <strong className="mono">{o.code}</strong> · {o.customer.name}
                      <span className="muted small"> · {statusLabel(o.status)}</span>
                    </span>
                    <span className="late">{fmtRelative(o.promisedBy)}</span>
                  </Link>
                ))
              ) : (
                <p className="muted small">Everything is on time.</p>
              )}
            </div>
          </div>

          <div className="cols two">
            <div className="panel">
              <div className="panel-title">
                Low stock <Link href="/admin/medicines?filter=low" className="muted">Restock</Link>
              </div>
              {data.lowStock.length ? (
                data.lowStock.map((m) => (
                  <div key={m.id} className="line-item">
                    <span>
                      {m.name} <span className="muted small">{m.strength}</span>
                    </span>
                    <span className={m.stock === 0 ? 'late' : 'muted'}>
                      {m.stock} / {m.reorderLevel}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted small">Every item is above its reorder level.</p>
              )}
            </div>
            <div className="panel">
              <div className="panel-title">
                Expiring within 60 days <Link href="/admin/medicines?filter=expiring" className="muted">Review</Link>
              </div>
              {data.expiring.length ? (
                data.expiring.map((b) => (
                  <div key={b.id} className="line-item">
                    <span>
                      {b.medicine.name} <span className="muted small mono">#{b.batchNo}</span>
                    </span>
                    <span className="muted">
                      {b.qtyRemaining} · {fmtShortDay(b.expiresAt)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted small">No batches expire soon.</p>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Consultations in range</div>
            {Object.keys(data.consultations).length ? (
              <div className="stats">
                {Object.entries(data.consultations).map(([s, v]) => (
                  <StatTile key={s} label={statusLabel(s)} value={v.count} hint={formatTk(v.feePoisha)} />
                ))}
              </div>
            ) : (
              <EmptyState icon="🩺" title="No consultations yet" />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
