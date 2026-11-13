'use client';

import { fmtRelative, fmtTime, fmtWhen, haptic, initials, invalidate, promptText, Switch, toast } from '@albarakah/ui';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { CHANNEL, type DoctorMe, type QueueItem } from '@/lib/doctor';
import { Icon } from './Icon';

/**
 * Paid consultations waiting for the doctor's yes or no. Instant calls come first and carry a
 * countdown, because the patient was promised a doctor within a few minutes.
 * Admins see the same list read-only.
 */
export function QueueList({ items, responseMinutes = 10, readOnly }: { items: QueueItem[]; responseMinutes?: number; readOnly?: boolean }) {
  const [busy, setBusy] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  async function respond(q: QueueItem, accept: boolean) {
    let reason: string | undefined;
    if (!accept) {
      const r = await promptText({
        title: 'Decline this patient?',
        message: q.kind === 'INSTANT' ? 'The call goes to the next doctor on duty.' : 'The patient is told you are unavailable and the team arranges their refund.',
        confirm: 'Decline',
        placeholder: 'Reason (optional)',
        destructive: true,
      });
      if (r === null) return;
      reason = r.trim() || undefined;
    }
    setBusy(q.id);
    try {
      const res = await api.post<{ ok: true; reassigned?: boolean }>(`/doctor/bookings/${q.id}/respond`, { accept, ...(reason ? { reason } : {}) });
      haptic(accept ? 'success' : 'warning');
      toast(accept ? 'Accepted — the patient has been told' : res.reassigned ? 'Passed to another doctor' : 'Declined');
      invalidate('/doctor');
    } catch (err) {
      toast((err as Error).message, 'bad');
      invalidate('/doctor/queue');
    } finally {
      setBusy('');
    }
  }

  if (!items.length) return null;
  return (
    <ul className="queue stagger">
      {items.map((q) => {
        const waited = now - new Date(q.waitingSince).getTime();
        const left = Math.ceil((responseMinutes * 60_000 - waited) / 60_000);
        return (
          <li key={q.id} className={`queue-card${q.kind === 'INSTANT' ? ' instant' : ''}${q.overdue || (q.kind === 'INSTANT' && left <= 0) ? ' overdue' : ''}`}>
            <span className="pt-avatar" aria-hidden="true">{initials(q.customer.name || 'P')}</span>
            <span className="cell-main">
              <strong>{q.customer.name || 'Patient'}</strong>
              <span className="cell-sub">
                {q.kind === 'INSTANT' ? `${CHANNEL[q.channel]} · now` : `${fmtWhen(q.startsAt)} – ${fmtTime(q.endsAt)} · ${CHANNEL[q.channel]}`}
              </span>
              {q.reason ? <span className="cell-sub">“{q.reason}”</span> : null}
              <span className="queue-tags">
                {q.kind === 'INSTANT' ? (
                  <span className={`chip ${left > 0 ? 'live' : 'bad'}`}>{left > 0 ? `⚡ Answer within ${left} min` : '⚡ Overdue'}</span>
                ) : (
                  <span className="chip">Paid {fmtRelative(q.waitingSince, now)}</span>
                )}
              </span>
            </span>
            {readOnly ? null : (
              <span className="queue-actions">
                <button type="button" className="btn small" disabled={busy === q.id} onClick={() => void respond(q, false)}>Decline</button>
                <button type="button" className="btn small primary" disabled={busy === q.id} onClick={() => void respond(q, true)}>
                  {busy === q.id ? '…' : 'Accept'}
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Interns switch this on to take instant video calls. The flag lapses on its own if the portal is closed. */
export function DutyCard({ me }: { me: DoctorMe }) {
  const [on, setOn] = useState(me.onDuty);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOn(me.onDuty), [me.onDuty]);

  async function toggle(next: boolean) {
    setBusy(true);
    setOn(next);
    try {
      await api.put('/doctor/duty', { onDuty: next });
      haptic('success');
      invalidate('/doctor/me');
    } catch (err) {
      setOn(!next);
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`duty-card${on ? ' on' : ''}`}>
      <span className="cell-icon"><Icon name="bolt" size={20} /></span>
      <span className="grow">
        <strong>{on ? 'On duty — taking instant calls' : 'Off duty'}</strong>
        <span className="muted small" style={{ display: 'block' }}>
          {on ? 'Keep the portal open. New patients appear below — answer within the promised minutes.' : 'Switch on to receive prepaid video calls from patients.'}
        </span>
      </span>
      <Switch label="On duty" checked={on} disabled={busy} onChange={(v) => void toggle(v)} />
    </div>
  );
}

/** Keeps an intern's duty flag alive while any doctor screen is open (the server forgets it after 30 minutes). */
export function useDutyHeartbeat(me: DoctorMe | undefined) {
  const active = me?.tier === 'INTERN' && me.onDuty;
  useEffect(() => {
    if (!active) return;
    const beat = () => void api.put('/doctor/duty', { onDuty: true }).catch(() => undefined);
    const t = setInterval(beat, 10 * 60_000);
    return () => clearInterval(t);
  }, [active]);
}
