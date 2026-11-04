'use client';

import { confirmAction, fmtDay, fmtRelative, fmtTime, fmtWhen, haptic, invalidate, Segmented, Sheet, SkeletonList, statusLabel, statusTone, toast } from '@albarakah/ui';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api, useGet } from '@/lib/api';
import { message, telLink } from '@/lib/app';
import { type Booking, canClose, CHANNEL, type DoctorMe, joinLink, type PatientHistory, rxText } from '@/lib/doctor';
import type { Rx, RxItem } from '@/lib/types';

const FREQ = ['1+0+1', '1+1+1', '1+0+0', '0+0+1', '0+1+0', 'As needed'];
const INSTR = ['After meal', 'Before meal', 'With water', 'At bedtime'];
const EMPTY_ITEM: RxItem = { medicine: '', dose: '', frequency: '1+0+1', days: 5, instructions: 'After meal' };
const draftKey = (id: string) => `rx-draft:${id}`;

function loadDraft(id: string): { rx: Rx; notes: string } | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** One booking: patient details, join, prior visits and the e-prescription composer. */
export function BookingSheet({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  return (
    <Sheet open={!!booking} onClose={onClose} title={booking ? `${booking.customer.name || 'Patient'} · ${booking.code}` : 'Booking'}>
      {booking ? <BookingBody b={booking} onDone={onClose} /> : null}
    </Sheet>
  );
}

function BookingBody({ b, onDone }: { b: Booking; onDone: () => void }) {
  const { data: me } = useGet<DoctorMe>('/doctor/me', { staleMs: 300_000 });
  const [tab, setTab] = useState<'visit' | 'history'>('visit');
  const now = Date.now();
  const join = joinLink(b.channel, me, b.patientPhone);
  const live = b.status === 'CONFIRMED' && new Date(b.startsAt).getTime() - 10 * 60_000 <= now && new Date(b.endsAt).getTime() >= now;

  return (
    <div className="stack">
      <div className="row between wrap">
        <span>
          <strong>{fmtWhen(b.startsAt)}</strong>
          <span className="muted small" style={{ display: 'block' }}>{CHANNEL[b.channel]} · {fmtRelative(b.startsAt, now)}</span>
        </span>
        <span className={`chip ${statusTone(b.status)}`}>{statusLabel(b.status)}</span>
      </div>
      {b.reason ? <div className="notice">“{b.reason}”</div> : null}
      <div className="actions">
        <a className="btn" href={telLink(b.patientPhone)}><Icon name="phone" size={18} /> Call</a>
        {join && b.status === 'CONFIRMED' ? (
          <a className={`btn${live ? ' primary' : ''}`} href={join} target="_blank" rel="noreferrer"><Icon name="video" size={18} /> Join {CHANNEL[b.channel]}</a>
        ) : null}
      </div>
      {b.channel === 'GOOGLE_MEET' && me && !me.meetLink ? <p className="error small">Add your Meet link in Profile so you can join.</p> : null}

      <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'visit', label: 'This visit' }, { value: 'history', label: 'Past visits' }]} />
      {tab === 'history' ? (
        <History customerId={b.customerId} exclude={b.id} />
      ) : b.status === 'CONFIRMED' ? (
        canClose(b, now) ? <Composer b={b} me={me} onDone={onDone} /> : <p className="muted">You can write the prescription from 15 minutes before the start time ({fmtTime(new Date(new Date(b.startsAt).getTime() - 15 * 60_000))}).</p>
      ) : (
        <Outcome b={b} me={me} />
      )}
    </div>
  );
}

function Outcome({ b, me }: { b: Pick<Booking, 'notes' | 'prescription' | 'status'> & { customer?: { name: string } }; me?: DoctorMe }) {
  if (b.status === 'NO_SHOW') return <p className="muted">The patient did not join.{b.notes ? ` Note: ${b.notes}` : ''}</p>;
  return (
    <div className="stack">
      {b.prescription ? <RxView rx={b.prescription} patient={b.customer?.name ?? ''} me={me} /> : <p className="muted">No prescription was written.</p>}
      {b.notes ? <p className="small"><span className="muted">Private notes: </span>{b.notes}</p> : null}
    </div>
  );
}

export function RxView({ rx, patient, me }: { rx: Rx; patient: string; me?: DoctorMe }) {
  return (
    <div className="rx-paper">
      <div className="row between">
        <strong className="rx-mark">℞</strong>
        <button
          className="btn small ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(rxText(rx, patient, me)).then(() => toast('Prescription copied'), () => toast('Could not copy', 'bad'));
          }}
        >
          Copy
        </button>
      </div>
      {rx.diagnosis ? <p><span className="muted small">Diagnosis</span><br /><strong>{rx.diagnosis}</strong></p> : null}
      <ol className="rx-list">
        {rx.items.map((i, n) => (
          <li key={n}>
            <strong>{i.medicine}</strong> {i.dose}
            <span className="muted small" style={{ display: 'block' }}>
              {[i.frequency, i.days ? `${i.days} days` : '', i.instructions].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ol>
      {rx.advice ? <p className="small"><span className="muted">Advice: </span>{rx.advice}</p> : null}
      {rx.followUpDays ? <p className="small"><span className="muted">Follow up in </span>{rx.followUpDays} days</p> : null}
    </div>
  );
}

function History({ customerId, exclude }: { customerId: string; exclude: string }) {
  const { data, pending, error } = useGet<PatientHistory>(`/doctor/patients/${customerId}`);
  const [open, setOpen] = useState<string | null>(null);
  if (pending) return <SkeletonList rows={3} />;
  if (error || !data) return <p className="error">{message(error)}</p>;
  const visits = data.visits.filter((v) => v.id !== exclude);
  return (
    <div className="stack">
      <p className="muted small">
        {data.patient.name} · {data.patient.phone}
        {data.patient.since ? ` · with us since ${fmtDay(data.patient.since)}` : ''}
      </p>
      {visits.length ? (
        <div className="group">
          {visits.map((v) => (
            <div key={v.id} className="press" style={{ flexDirection: 'column', alignItems: 'stretch' }} onClick={() => setOpen(open === v.id ? null : v.id)}>
              <div className="row between">
                <span className="cell-main">
                  <strong>{fmtDay(v.startsAt)}</strong>
                  <span className="cell-sub">{v.prescription?.diagnosis || v.reason || CHANNEL[v.channel]}</span>
                </span>
                <span className={`chip ${statusTone(v.status)}`}>{statusLabel(v.status)}</span>
              </div>
              {open === v.id ? <div style={{ marginTop: 10 }}><Outcome b={v} /></div> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">First visit with you.</p>
      )}
    </div>
  );
}

function Composer({ b, me, onDone }: { b: Booking; me?: DoctorMe; onDone: () => void }) {
  const draft = loadDraft(b.id);
  const [rx, setRx] = useState<Rx>(draft?.rx ?? { diagnosis: '', items: [{ ...EMPTY_ITEM }], advice: '', followUpDays: 0 });
  const [notes, setNotes] = useState(draft?.notes ?? '');
  const [busy, setBusy] = useState(false);

  // Keep a draft so a dropped call or closed sheet loses nothing.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(b.id), JSON.stringify({ rx, notes }));
      } catch {
        /* storage blocked */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [b.id, rx, notes]);

  const setItem = (n: number, patch: Partial<RxItem>) => setRx((r) => ({ ...r, items: r.items.map((it, i) => (i === n ? { ...it, ...patch } : it)) }));
  const removeItem = (n: number) => setRx((r) => ({ ...r, items: r.items.filter((_, i) => i !== n) }));

  async function close(status: 'COMPLETED' | 'NO_SHOW') {
    const items = rx.items.filter((i) => i.medicine.trim());
    if (status === 'NO_SHOW' && !(await confirmAction({ title: 'Mark as no-show?', message: 'Use this when the patient never joined the call.', confirm: 'No-show', destructive: true }))) return;
    if (status === 'COMPLETED' && !items.length && !rx.diagnosis.trim() && !rx.advice.trim()) {
      const ok = await confirmAction({ title: 'Complete without a prescription?', message: 'The patient will not receive any written advice.', confirm: 'Complete' });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api.patch(`/doctor/bookings/${b.id}`, {
        status,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(status === 'COMPLETED' && (items.length || rx.diagnosis.trim() || rx.advice.trim()) ? { prescription: { ...rx, items } } : {}),
      });
      try {
        localStorage.removeItem(draftKey(b.id));
      } catch {
        /* storage blocked */
      }
      haptic('success');
      toast(status === 'COMPLETED' ? 'Visit completed — prescription sent' : 'Marked as no-show');
      invalidate('/doctor');
      onDone();
    } catch (err) {
      toast(message(err), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <label className="field">
        <span>Diagnosis</span>
        <input className="input" value={rx.diagnosis} maxLength={300} placeholder="e.g. Acute gastritis" onChange={(e) => setRx({ ...rx, diagnosis: e.target.value })} />
      </label>

      <div className="day-head">
        <strong>Medicines</strong>
        <span className="muted small">{rx.items.length}/20</span>
      </div>
      {rx.items.map((it, n) => (
        <div key={n} className="rx-item">
          <input className="input span" placeholder={`Medicine ${n + 1} (e.g. Omeprazole)`} maxLength={160} value={it.medicine} onChange={(e) => setItem(n, { medicine: e.target.value })} />
          <input className="input" placeholder="Dose (20 mg)" maxLength={60} value={it.dose} onChange={(e) => setItem(n, { dose: e.target.value })} />
          <input className="input" inputMode="numeric" placeholder="Days" value={it.days || ''} onChange={(e) => setItem(n, { days: Math.min(365, Number(e.target.value.replace(/\D/g, '')) || 0) })} />
          <div className="span hscroll chips-row">
            {FREQ.map((f) => (
              <button key={f} type="button" className={`chip${it.frequency === f ? ' live' : ''}`} onClick={() => setItem(n, { frequency: f })}>{f}</button>
            ))}
          </div>
          <div className="span hscroll chips-row">
            {INSTR.map((f) => (
              <button key={f} type="button" className={`chip${it.instructions === f ? ' live' : ''}`} onClick={() => setItem(n, { instructions: it.instructions === f ? '' : f })}>{f}</button>
            ))}
          </div>
          {rx.items.length > 1 ? (
            <button type="button" className="btn small ghost span" onClick={() => removeItem(n)}>Remove</button>
          ) : null}
        </div>
      ))}
      {rx.items.length < 20 ? (
        <button type="button" className="btn ghost" onClick={() => setRx((r) => ({ ...r, items: [...r.items, { ...EMPTY_ITEM }] }))}>
          <Icon name="plus" size={18} /> Add medicine
        </button>
      ) : null}

      <label className="field">
        <span>Advice</span>
        <textarea className="input" rows={3} maxLength={1000} placeholder="Diet, rest, warning signs…" value={rx.advice} onChange={(e) => setRx({ ...rx, advice: e.target.value })} />
      </label>
      <div className="field">
        <span>Follow up</span>
        <Segmented
          label="Follow up"
          value={String(rx.followUpDays)}
          onChange={(v) => setRx({ ...rx, followUpDays: Number(v) })}
          options={[{ value: '0', label: 'None' }, { value: '3', label: '3 d' }, { value: '7', label: '1 wk' }, { value: '14', label: '2 wk' }, { value: '30', label: '1 mo' }]}
        />
      </div>
      <label className="field">
        <span>Private notes <span className="muted small">(only you see these)</span></span>
        <textarea className="input" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <details className="rx-preview">
        <summary className="muted small">Preview what the patient receives</summary>
        <RxView rx={{ ...rx, items: rx.items.filter((i) => i.medicine.trim()) }} patient={b.customer.name} me={me} />
      </details>

      <div className="actions">
        <button className="btn danger" disabled={busy} onClick={() => void close('NO_SHOW')}>No-show</button>
        <button className="btn primary" disabled={busy} onClick={() => void close('COMPLETED')}>{busy ? 'Saving…' : 'Complete visit'}</button>
      </div>
    </div>
  );
}

