'use client';

import { formatTk } from '@albarakah/domain';
import {
  chooseAction, confirmAction, EmptyState, fmtRelative, fmtTime, fmtWeekday, haptic, invalidate, LargeTitle, mutate, promptText, Sheet,
  SkeletonList, StatTile, statusLabel, statusTone, Switch, toast,
} from '@albarakah/ui';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api, useApi, useGet } from '@/lib/api';
import { mapsLink, message, pct, telLink } from '@/lib/app';
import { useLive } from '@/lib/live';
import type { AddressSnap } from '@/lib/types';

interface Job {
  id: string; code: string; status: 'ASSIGNED' | 'OUT_FOR_DELIVERY'; type: 'NORMAL' | 'EMERGENCY'; promisedBy: string;
  slotStart: string | null; slotEnd: string | null; addressSnapshot: AddressSnap; totalPoisha: number; paymentMethod: 'COD' | 'BKASH';
  paymentStatus: string; riderPayoutPoisha: number; notes: string | null; updatedAt: string;
  customer: { name: string }; items: { nameSnapshot: string; qty: number }[];
}
interface Summary {
  online: boolean; active: number; deliveredToday: number; failedToday: number; earnedTodayPoisha: number;
  week: { date: string; poisha: number }[]; cashHeldPoisha: number; rating: number | null; ratingCount: number; onTimeRate: number | null;
}

const FAIL_REASONS = ['Customer not reachable', 'Customer not at address', 'Wrong or incomplete address', 'Customer refused the order', 'Customer could not pay'];

/** Ticks once a minute so countdowns stay honest without re-rendering every second. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function RiderToday() {
  const { user } = useApi();
  const { data: jobs, pending } = useGet<Job[]>('/delivery/jobs', { pollMs: 60_000 });
  const { data: s } = useGet<Summary>('/delivery/summary', { pollMs: 120_000 });
  const [deliver, setDeliver] = useState<Job | null>(null);
  const now = useNow();

  const live = useLive('/delivery/events/ticket', (e) => {
    invalidate('/delivery');
    if (e.status === 'ASSIGNED') {
      haptic('success');
      toast('New job assigned', 'info');
    }
  });

  async function setOnline(online: boolean) {
    mutate<Summary>('/delivery/summary', (prev) => ({ ...(prev as Summary), online }));
    try {
      await api.put('/delivery/online', { online });
      toast(online ? 'You are on shift' : 'You are off shift', 'info');
    } catch (err) {
      toast(message(err), 'bad');
    }
    invalidate('/delivery/summary');
  }

  async function start(j: Job) {
    if (!(await confirmAction({ title: `Pick up ${j.code}?`, message: 'The customer is told you are on the way and gets their handover code.', confirm: 'Start delivery' }))) return;
    await move(j, { to: 'OUT_FOR_DELIVERY' });
  }

  async function fail(j: Job) {
    const pick = await chooseAction('Why could it not be delivered?', [...FAIL_REASONS.map((r) => ({ label: r, value: r })), { label: 'Something else…', value: '__other' }]);
    if (!pick) return;
    let note = pick;
    if (pick === '__other') {
      const t = await promptText({ title: 'What happened?', placeholder: 'Short reason', confirm: 'Mark failed', required: true, destructive: true });
      if (t === null) return;
      note = t;
    } else if (!(await confirmAction({ title: `Mark ${j.code} failed?`, message: pick, confirm: 'Mark failed', destructive: true }))) return;
    await move(j, { to: 'FAILED', note });
  }

  async function move(j: Job, body: { to: string; note?: string; code?: string }) {
    try {
      await api.patch(`/delivery/jobs/${j.id}/status`, body);
      toast(`${j.code}: ${statusLabel(body.to)}`);
      invalidate('/delivery');
      return true;
    } catch (err) {
      toast(message(err), 'bad');
      return false;
    }
  }

  const max = Math.max(1, ...(s?.week.map((d) => d.poisha) ?? [1]));

  return (
    <>
      <LargeTitle
        sub={
          <span className="row" style={{ gap: 8 }}>
            <span className={`live-dot${live ? ' on' : ''}`} /> {user ? `Hi, ${user.name.split(' ')[0]}` : ''}
          </span>
        }
      >
        Today
      </LargeTitle>

      <div className={`shift ${s?.online ? 'on' : ''}`}>
        <span className="grow">
          <strong>{s?.online ? 'On shift' : 'Off shift'}</strong>
          <span className="small" style={{ display: 'block', opacity: 0.8 }}>
            {s?.online ? 'Admins can assign you new jobs.' : 'Go on shift to receive jobs.'}
          </span>
        </span>
        <Switch label="On shift" checked={!!s?.online} onChange={(v) => void setOnline(v)} disabled={!s} />
      </div>

      {s ? (
        <div className="stats" style={{ marginTop: 14 }}>
          <StatTile label="Earned today" value={formatTk(s.earnedTodayPoisha)} />
          <StatTile label="Delivered" value={s.deliveredToday} hint={s.failedToday ? `${s.failedToday} failed` : 'today'} />
          <StatTile label="Cash to hand in" value={formatTk(s.cashHeldPoisha)} tone={s.cashHeldPoisha > 0 ? 'warn' : undefined} />
          <StatTile label="Rating" value={s.rating ? `${s.rating.toFixed(1)} ★` : '—'} hint={s.onTimeRate !== null ? `${pct(s.onTimeRate)} on time` : undefined} />
        </div>
      ) : null}

      <p className="group-label">Jobs {jobs?.length ? `· ${jobs.length}` : ''}</p>
      {pending ? <SkeletonList rows={3} /> : null}
      {jobs && !jobs.length ? (
        <EmptyState icon="🛵" title="No jobs right now">{s?.online ? 'New jobs appear here the moment they are assigned.' : 'Go on shift to start receiving jobs.'}</EmptyState>
      ) : null}

      <div className="stack stagger">
        {jobs?.map((j) => {
          const due = new Date(j.promisedBy).getTime();
          const late = due < now;
          const cod = j.paymentMethod === 'COD' && j.paymentStatus !== 'PAID';
          return (
            <article key={j.id} className={`job${j.type === 'EMERGENCY' ? ' urgent' : ''}`}>
              <header className="row between">
                <span className="row" style={{ gap: 8 }}>
                  <strong className="mono">{j.code}</strong>
                  {j.type === 'EMERGENCY' ? <span className="chip bad">Emergency</span> : null}
                </span>
                <span className={`chip ${statusTone(j.status)}`}>{statusLabel(j.status)}</span>
              </header>
              <div className={`job-due ${late ? 'late' : ''}`}>
                <Icon name="clock" size={16} />
                {late ? `Late · was due ${fmtTime(j.promisedBy)}` : `Due ${fmtTime(j.promisedBy)} · ${fmtRelative(j.promisedBy, now)}`}
              </div>
              <a className="job-addr" href={mapsLink(j.addressSnapshot.line)} target="_blank" rel="noreferrer">
                <Icon name="map" size={18} />
                <span className="grow">
                  <strong>{j.customer.name}{j.addressSnapshot.zone ? ` · ${j.addressSnapshot.zone}` : ''}</strong>
                  <span className="cell-sub" style={{ display: 'block' }}>{j.addressSnapshot.line}</span>
                  {j.addressSnapshot.notes ? <span className="cell-sub" style={{ display: 'block' }}>“{j.addressSnapshot.notes}”</span> : null}
                </span>
                <span className="muted small">Map ›</span>
              </a>
              <p className="small muted">{j.items.map((i) => `${i.qty}× ${i.nameSnapshot}`).join(' · ')}</p>
              {j.notes ? <p className="small">Note: {j.notes}</p> : null}
              <div className="job-money">
                {cod ? (
                  <span><span className="muted small">Collect cash</span><strong className="price" style={{ display: 'block' }}>{formatTk(j.totalPoisha)}</strong></span>
                ) : (
                  <span><span className="muted small">Paid online</span><strong style={{ display: 'block' }}>Nothing to collect</strong></span>
                )}
                <span style={{ textAlign: 'right' }}><span className="muted small">You earn</span><strong style={{ display: 'block' }}>{formatTk(j.riderPayoutPoisha)}</strong></span>
              </div>
              <div className="actions">
                {j.addressSnapshot.phone ? <a className="btn" href={telLink(j.addressSnapshot.phone)}><Icon name="phone" size={18} /> Call</a> : null}
                {j.status === 'ASSIGNED' ? (
                  <button className="btn primary" onClick={() => void start(j)}>Start delivery</button>
                ) : (
                  <>
                    <button className="btn danger" onClick={() => void fail(j)}>Failed</button>
                    <button className="btn primary" onClick={() => setDeliver(j)}>Delivered</button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {s ? (
        <>
          <p className="group-label">This week</p>
          <div className="panel">
            <div className="week">
              {s.week.map((d) => (
                <div key={d.date} className="week-col" title={formatTk(d.poisha)}>
                  <span className="week-bar" style={{ height: `${Math.max(4, (d.poisha / max) * 100)}%` }} />
                  <span className="muted small">{fmtWeekday(d.date)}</span>
                </div>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>{formatTk(s.week.reduce((n, d) => n + d.poisha, 0))} earned in the last 7 days</p>
          </div>
        </>
      ) : null}

      <Sheet open={!!deliver} onClose={() => setDeliver(null)} title={deliver ? `Hand over ${deliver.code}` : 'Hand over'}>
        {deliver ? (
          <Handover
            job={deliver}
            onSubmit={async (code) => {
              const ok = await move(deliver, { to: 'DELIVERED', code });
              if (ok) {
                haptic('success');
                setDeliver(null);
              }
              return ok;
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function Handover({ job, onSubmit }: { job: Job; onSubmit: (code: string) => Promise<boolean> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const cod = job.paymentMethod === 'COD' && job.paymentStatus !== 'PAID';
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 4) return;
    setBusy(true);
    const ok = await onSubmit(code);
    setBusy(false);
    if (!ok) setCode('');
  }
  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      {cod ? (
        <div className="notice ok" style={{ textAlign: 'center' }}>
          Collect <strong className="price">{formatTk(job.totalPoisha)}</strong> in cash first
        </div>
      ) : null}
      <p className="muted">Ask {job.customer.name} for the 4-digit code shown in their app or SMS.</p>
      <input
        className="input otp-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={4}
        placeholder="••••"
        aria-label="Handover code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
      />
      <button className="btn primary block" disabled={busy || code.length !== 4}>{busy ? 'Checking…' : 'Confirm delivery'}</button>
    </form>
  );
}
