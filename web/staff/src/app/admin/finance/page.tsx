'use client';

import { formatTk } from '@albarakah/domain';
import { AreaChart, BarList, confirmAction, EmptyState, fmtDay, fmtShortDay, invalidate, LargeTitle, Segmented, SkeletonList, StatTile, toast } from '@albarakah/ui';
import { useState } from 'react';
import { api, useGet } from '@/lib/api';
import { downloadCsv, message, tkToPoisha } from '@/lib/app';

interface Finance {
  from: string;
  to: string;
  commissionPct: number;
  sales: { orders: number; medicinePoisha: number; deliveryFeesPoisha: number; grossPoisha: number };
  consultations: { count: number; instant: number; feesPoisha: number; commissionPoisha: number; doctorSharePoisha: number };
  expenses: { riderPayoutsPoisha: number; byCategory: { category: string; amountPoisha: number }[]; otherPoisha: number };
  incomePoisha: number;
  spendingPoisha: number;
  netPoisha: number;
  daily: { day: string; salesPoisha: number; orders: number }[];
}
interface Expenses {
  rows: { id: string; category: string; amountPoisha: number; note: string | null; spentAt: string; createdBy: { name: string } | null }[];
  totalPoisha: number;
}

type Preset = 'month' | 'last' | '90';
const CATEGORIES = ['Stock purchase', 'Rent', 'Salaries', 'Utilities', 'Marketing', 'Transport', 'Other'];

/** Calendar days in Dhaka, as YYYY-MM-DD. */
const dhakaDay = (d: Date) => new Date(d.getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
function presetRange(p: Preset): { from: string; to: string } {
  const today = dhakaDay(new Date());
  if (p === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  if (p === '90') return { from: dhakaDay(new Date(Date.now() - 89 * 86_400_000)), to: today };
  const [y, m] = today.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1));
  const last = new Date(Date.UTC(y, m - 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

/** Money in and out: sales, consultation commission, rider payouts and recorded expenses. */
export default function FinancePage() {
  const [preset, setPreset] = useState<Preset>('month');
  const { from, to } = presetRange(preset);
  const qs = `from=${from}&to=${to}`;
  const { data, error, pending } = useGet<Finance>(`/admin/finance?${qs}`, { staleMs: 30_000 });
  const { data: exp } = useGet<Expenses>(`/admin/expenses?${qs}`, { staleMs: 30_000 });

  return (
    <>
      <LargeTitle sub={data ? `${fmtDay(data.from)} – ${fmtDay(data.to)}` : 'Income, spending and commission'}>Finance</LargeTitle>
      <div className="toolbar">
        <Segmented<Preset>
          label="Period"
          value={preset}
          onChange={setPreset}
          options={[{ value: 'month', label: 'This month' }, { value: 'last', label: 'Last month' }, { value: '90', label: '90 days' }]}
        />
        {data ? (
          <button
            className="btn small"
            onClick={() =>
              downloadCsv(`finance-${from}-${to}`, [
                ['Day', 'Delivered sales (Tk)', 'Orders'],
                ...data.daily.map((d) => [d.day, d.salesPoisha / 100, d.orders]),
                [],
                ['Category', 'Spent (Tk)'],
                ['Rider payouts', data.expenses.riderPayoutsPoisha / 100],
                ...data.expenses.byCategory.map((c) => [c.category, c.amountPoisha / 100]),
              ])
            }
          >
            Export
          </button>
        ) : null}
      </div>

      {error && !data ? <p className="error">{error.message}</p> : null}
      {pending && !data ? <SkeletonList rows={6} /> : null}

      {data ? (
        <div className="stack stagger">
          <div className="stats">
            <StatTile label="Income" value={formatTk(data.incomePoisha)} hint="sales + consult commission" />
            <StatTile label="Spending" value={formatTk(data.spendingPoisha)} hint="payouts + expenses" />
            <StatTile label="Net" value={formatTk(data.netPoisha)} tone={data.netPoisha < 0 ? 'bad' : 'ok'} />
            <StatTile label="Delivered orders" value={data.sales.orders} hint={formatTk(data.sales.grossPoisha)} />
          </div>

          <div className="panel">
            <div className="panel-title"><strong>Delivered sales per day</strong></div>
            {data.daily.length ? (
              <AreaChart label="Delivered sales per day" format={formatTk} points={data.daily.map((d) => ({ x: fmtShortDay(d.day), y: d.salesPoisha }))} />
            ) : <p className="muted small">No delivered orders in this period.</p>}
          </div>

          <div className="cols two">
            <div className="panel">
              <div className="panel-title"><strong>Income</strong></div>
              <BarList
                format={formatTk}
                items={[
                  { label: 'Medicines', value: data.sales.medicinePoisha },
                  { label: 'Delivery fees', value: data.sales.deliveryFeesPoisha },
                  { label: `Consult commission (${data.commissionPct}%)`, value: data.consultations.commissionPoisha, sub: `${data.consultations.count} visits · ${data.consultations.instant} instant` },
                ]}
              />
              <p className="muted small" style={{ marginTop: 8 }}>
                Patients paid {formatTk(data.consultations.feesPoisha)} for visits; doctors’ share is {formatTk(data.consultations.doctorSharePoisha)}.
              </p>
            </div>
            <div className="panel">
              <div className="panel-title"><strong>Spending</strong></div>
              {data.spendingPoisha ? (
                <BarList
                  format={formatTk}
                  items={[
                    ...(data.expenses.riderPayoutsPoisha ? [{ label: 'Rider payouts', value: data.expenses.riderPayoutsPoisha }] : []),
                    ...data.expenses.byCategory.map((c) => ({ label: c.category, value: c.amountPoisha })),
                  ]}
                />
              ) : <p className="muted small">Nothing spent yet in this period.</p>}
            </div>
          </div>

          <AddExpense />

          <p className="group-label">Expenses</p>
          {exp?.rows.length ? (
            <div className="group cv">
              {exp.rows.map((r) => (
                <div key={r.id} className="cell">
                  <span className="cell-main">
                    <strong>{r.category}</strong>
                    <span className="cell-sub">
                      {fmtDay(r.spentAt)}{r.note ? ` · ${r.note}` : ''}{r.createdBy ? ` · by ${r.createdBy.name}` : ''}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="mono">{formatTk(r.amountPoisha)}</span>
                    <button className="btn small" aria-label={`Delete ${r.category} expense`} onClick={() => void remove(r.id)}>Delete</button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="🧾" title="No expenses recorded">Add rent, salaries or stock purchases to see your real profit.</EmptyState>
          )}
        </div>
      ) : null}
    </>
  );
}

async function remove(id: string) {
  if (!(await confirmAction({ title: 'Delete this expense?', confirm: 'Delete', destructive: true }))) return;
  try {
    await api.del(`/admin/expenses/${id}`);
    toast('Expense deleted');
    invalidate('/admin/expenses');
    invalidate('/admin/finance');
  } catch (err) {
    toast(message(err), 'bad');
  }
}

function AddExpense() {
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [spentAt, setSpentAt] = useState(() => dhakaDay(new Date()));
  const [busy, setBusy] = useState(false);
  const amountPoisha = tkToPoisha(amount);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!amountPoisha || amountPoisha <= 0) return toast('Enter an amount in taka', 'bad');
    setBusy(true);
    try {
      await api.post('/admin/expenses', { category, amountPoisha, spentAt, ...(note.trim() ? { note: note.trim() } : {}) });
      toast('Expense added');
      setAmount('');
      setNote('');
      invalidate('/admin/expenses');
      invalidate('/admin/finance');
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel stack" style={{ gap: 10 }} onSubmit={(e) => void save(e)}>
      <div className="panel-title"><strong>Record an expense</strong></div>
      <div className="form-grid two">
        <label className="field">
          <span>Category</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Amount (Tk)</span>
          <input className="input mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" required />
        </label>
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" value={spentAt} max={dhakaDay(new Date())} onChange={(e) => setSpentAt(e.target.value)} required />
        </label>
        <label className="field">
          <span>Note</span>
          <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </label>
      </div>
      <div className="row between">
        <span className="muted small">Rider payouts are counted automatically.</span>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Add expense'}</button>
      </div>
    </form>
  );
}
