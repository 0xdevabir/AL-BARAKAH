'use client';

import { formatTk } from '@albarakah/domain';
import { confirmAction, EmptyState, fmtWhen, invalidate, LargeTitle, SearchField, Segmented, SkeletonList, statusLabel, statusTone, toast } from '@albarakah/ui';
import { useDeferredValue, useState } from 'react';
import { api, useGet } from '@/lib/api';
import { message } from '@/lib/app';

interface Row {
  id: string; code: string; startsAt: string; status: string; channel: 'GOOGLE_MEET' | 'WHATSAPP'; feePoisha: number;
  customer: { name: string; phone: string }; doctor: { user: { name: string } };
  payments: { id: string; status: 'PAID' | 'REFUNDED'; trxId: string | null }[];
}
type View = 'upcoming' | 'past' | 'refund';

export default function ConsultationsPage() {
  const [view, setView] = useState<View>('upcoming');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const { data, pending } = useGet<Row[]>('/admin/consultations', { pollMs: 60_000 });
  const now = Date.now();

  // A paid booking the doctor never held (no-show by doctor, or a hold that lapsed) should be refunded.
  const needsRefund = (c: Row) => c.payments.some((p) => p.status === 'PAID') && (c.status === 'HOLD' || (c.status === 'CONFIRMED' && new Date(c.startsAt).getTime() < now - 2 * 3_600_000));
  const all = (data ?? []).filter((c) => !dq || c.code.toLowerCase().includes(dq) || c.customer.name.toLowerCase().includes(dq) || c.doctor.user.name.toLowerCase().includes(dq) || c.customer.phone.includes(dq));
  const rows =
    view === 'refund'
      ? all.filter(needsRefund)
      : view === 'upcoming'
        ? all.filter((c) => new Date(c.startsAt).getTime() >= now - 3_600_000 && c.status === 'CONFIRMED').reverse()
        : all.filter((c) => new Date(c.startsAt).getTime() < now - 3_600_000 || c.status !== 'CONFIRMED');
  const refundCount = (data ?? []).filter(needsRefund).length;

  async function refund(c: Row, paymentId: string) {
    if (!(await confirmAction({ title: `Refund ${formatTk(c.feePoisha)}?`, message: `Sends the fee back to ${c.customer.name}'s bKash. This cannot be undone.`, confirm: 'Refund', destructive: true }))) return;
    try {
      await api.post(`/payments/${paymentId}/refund`, {});
      toast('Refund sent');
      invalidate('/admin/consultations');
      invalidate('/admin/dashboard');
    } catch (err) {
      toast(message(err), 'bad');
    }
  }

  return (
    <>
      <LargeTitle sub="Bookings across all doctors">Consultations</LargeTitle>
      <div className="toolbar">
        <Segmented<View>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
            { value: 'refund', label: 'Refunds', badge: refundCount || undefined },
          ]}
        />
        <SearchField value={q} onChange={setQ} placeholder="Code, patient or doctor" />
      </div>
      {pending ? <SkeletonList rows={6} /> : null}
      {data && !rows.length ? (
        <EmptyState icon={view === 'refund' ? '✓' : '🩺'} title={view === 'refund' ? 'No refunds due' : 'Nothing here'} />
      ) : null}
      {rows.length ? (
        <div className="group cv">
          {rows.map((c) => {
            const paid = c.payments.find((p) => p.status === 'PAID');
            return (
              <div key={c.id}>
                <span className="cell-main">
                  <strong>
                    {c.customer.name} <span className="muted small">with {c.doctor.user.name}</span>
                  </strong>
                  <span className="cell-sub">
                    {fmtWhen(c.startsAt)} · {c.channel === 'GOOGLE_MEET' ? 'Meet' : 'WhatsApp'} · <span className="mono">{c.code}</span>
                    {paid?.trxId ? ` · bKash ${paid.trxId}` : ''}
                  </span>
                </span>
                <span className="cell-end">
                  <span className={`chip ${statusTone(c.status)}`}>{statusLabel(c.status)}</span>
                  <span className="small mono">{formatTk(c.feePoisha)}{c.payments.some((p) => p.status === 'REFUNDED') ? ' · refunded' : ''}</span>
                  {paid && (view === 'refund' || c.status === 'NO_SHOW') ? (
                    <button className="btn small danger" onClick={() => void refund(c, paid.id)}>Refund</button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
