'use client';

import { confirmAction, fmtDay, fmtRelative, fmtTime, fmtWhen, haptic, initials, invalidate, promptText, Segmented, Sheet, SkeletonList, statusLabel, statusTone, toast } from '@albarakah/ui';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api, useGet } from '@/lib/api';
import { message, telLink } from '@/lib/app';
import {
  type Booking, canClose, CHANNEL, type DoctorMe, FREQ, freqLabel, joinLink, loadTemplates, type PatientHistory, printRx, type RxTemplate, rxText, saveTemplates, visitLabel,
} from '@/lib/doctor';
import type { Rx, RxItem } from '@/lib/types';

const INSTR = ['After meal', 'Before meal', 'With water', 'At bedtime', 'Empty stomach'];
const DAYS = [3, 5, 7, 14, 30];
const EMPTY_ITEM: RxItem = { medicine: '', dose: '', frequency: '1+0+1', days: 5, instructions: 'After meal' };
const EMPTY_RX: Rx = { diagnosis: '', items: [{ ...EMPTY_ITEM }], advice: '', followUpDays: 0 };
const draftKey = (id: string) => `rx-draft:${id}`;

function loadDraft(id: string): { rx: Rx; notes: string } | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** One booking: patient card, guided steps, join, prior visits and the e-prescription composer. */
export function BookingSheet({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  return (
    <Sheet open={!!booking} onClose={onClose} title={booking ? `${booking.customer.name || 'Patient'} · ${booking.code}` : 'Booking'}>
      {booking ? <BookingBody b={booking} onDone={onClose} /> : null}
    </Sheet>
  );
}

function BookingBody({ b, onDone }: { b: Booking; onDone: () => void }) {
  const { data: me } = useGet<DoctorMe>('/doctor/me', { staleMs: 300_000 });
  const { data: hist } = useGet<PatientHistory>(`/doctor/patients/${b.customerId}`, { staleMs: 60_000 });
  const [tab, setTab] = useState<'visit' | 'history'>('visit');
  const [joined, setJoined] = useState(false);
  const now = Date.now();
  const join = joinLink(b.channel, me, b.patientPhone);
  const live = b.status === 'CONFIRMED' && new Date(b.startsAt).getTime() - 10 * 60_000 <= now && new Date(b.endsAt).getTime() >= now;
  const past = hist?.visits.filter((v) => v.id !== b.id) ?? [];
  const lastRx = past.find((v) => v.prescription?.items.length)?.prescription ?? null;
  const visitNo = hist ? hist.visits.filter((v) => v.status === 'COMPLETED' && v.id !== b.id).length + 1 : 0;
  const writable = b.status === 'CONFIRMED' && canClose(b, now);
  // The guided steps: join → write → complete. Step 1 counts as done once they tap Join or the slot has begun.
  const step = b.status !== 'CONFIRMED' ? 3 : joined || new Date(b.startsAt).getTime() <= now ? 1 : 0;

  return (
    <div className="stack">
      <div className="patient-card">
        <span className="pt-avatar" aria-hidden="true">{initials(b.customer.name || 'P')}</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <strong className="ellipsis" style={{ display: 'block' }}>{b.customer.name || 'Patient'}</strong>
          <span className="muted small mono">{b.patientPhone}</span>
          <span className="pt-tags">
            {hist ? <span className={`chip${visitNo === 1 ? ' live' : ''}`}>{visitLabel(visitNo)}</span> : null}
            {lastRx?.diagnosis ? <span className="chip">Last: {lastRx.diagnosis}</span> : null}
          </span>
        </span>
        <a className="btn small" href={telLink(b.patientPhone)} aria-label="Call the patient"><Icon name="phone" size={16} /></a>
      </div>

      <div className="consult-when">
        <span>
          <strong>{fmtWhen(b.startsAt)} – {fmtTime(b.endsAt)}</strong>
          <span className="muted small" style={{ display: 'block' }}>{CHANNEL[b.channel]} · {fmtRelative(b.startsAt, now)}</span>
        </span>
        <span className={`chip ${live ? 'live' : statusTone(b.status)}`}>{live ? 'Live' : statusLabel(b.status)}</span>
      </div>
      {b.reason ? <div className="notice"><span className="muted small" style={{ display: 'block' }}>Patient says</span>“{b.reason}”</div> : null}

      {b.status === 'CONFIRMED' ? (
        <ol className="guide" aria-label="Steps">
          <li className={step > 0 ? 'done' : 'now'}>
            <b>{step > 0 ? '✓' : 1}</b>
            <span className="grow">
              <strong>Start the call</strong>
              <span className="muted small">{b.channel === 'GOOGLE_MEET' ? 'Opens your Meet room' : 'Opens WhatsApp to the patient'}</span>
            </span>
            {join ? (
              <a className={`btn small${live ? ' primary' : ''}`} href={join} target="_blank" rel="noreferrer" onClick={() => setJoined(true)}>
                <Icon name="video" size={16} /> Join
              </a>
            ) : null}
          </li>
          <li className={step === 1 ? 'now' : undefined}>
            <b>2</b>
            <span className="grow">
              <strong>Write the prescription</strong>
              <span className="muted small">{writable ? 'Below — drafts save as you type' : `Opens at ${fmtTime(new Date(new Date(b.startsAt).getTime() - 15 * 60_000))}`}</span>
            </span>
          </li>
          <li>
            <b>3</b>
            <span className="grow">
              <strong>Complete the visit</strong>
              <span className="muted small">The patient gets the ℞ in their app instantly</span>
            </span>
          </li>
        </ol>
      ) : null}
      {b.channel === 'GOOGLE_MEET' && me && !me.meetLink ? <p className="error small">Add your Meet link in Profile so you can join.</p> : null}

      <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'visit', label: 'This visit' }, { value: 'history', label: `Past visits${past.length ? ` · ${past.length}` : ''}` }]} />
      {tab === 'history' ? (
        <History customerId={b.customerId} exclude={b.id} me={me} />
      ) : b.status === 'CONFIRMED' ? (
        writable ? <Composer b={b} me={me} lastRx={lastRx} onDone={onDone} /> : <p className="muted">You can write the prescription from 15 minutes before the start time.</p>
      ) : (
        <Outcome b={b} me={me} />
      )}
    </div>
  );
}

function Outcome({ b, me }: { b: Pick<Booking, 'notes' | 'prescription' | 'status' | 'startsAt'> & { customer?: { name: string } }; me?: DoctorMe }) {
  if (b.status === 'NO_SHOW') return <p className="muted">The patient did not join.{b.notes ? ` Note: ${b.notes}` : ''}</p>;
  return (
    <div className="stack">
      {b.prescription ? <RxView rx={b.prescription} patient={b.customer?.name ?? ''} me={me} when={b.startsAt} /> : <p className="muted">No prescription was written.</p>}
      {b.notes ? <p className="small"><span className="muted">Private notes: </span>{b.notes}</p> : null}
    </div>
  );
}

export function RxView({ rx, patient, me, when }: { rx: Rx; patient: string; me?: DoctorMe; when?: string }) {
  return (
    <div className="rx-paper">
      <div className="row between">
        <strong className="rx-mark">℞</strong>
        <span className="row" style={{ gap: 4 }}>
          <button className="btn small ghost" onClick={() => void navigator.clipboard?.writeText(rxText(rx, patient, me)).then(() => toast('Prescription copied'), () => toast('Could not copy', 'bad'))}>Copy</button>
          <button className="btn small ghost" onClick={() => printRx(rx, patient, me, when) || toast('Allow pop-ups to print', 'bad')}>Print / PDF</button>
        </span>
      </div>
      {rx.diagnosis ? <p style={{ margin: 0 }}><span className="muted small">Diagnosis</span><br /><strong>{rx.diagnosis}</strong></p> : null}
      <ol className="rx-list">
        {rx.items.map((i, n) => (
          <li key={n}>
            <strong>{i.medicine}</strong> {i.dose}
            <span className="muted small" style={{ display: 'block' }}>
              {[i.frequency && `${i.frequency}${freqLabel(i.frequency) ? ` (${freqLabel(i.frequency)})` : ''}`, i.days ? `${i.days} days` : '', i.instructions].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ol>
      {rx.advice ? <p className="small" style={{ margin: 0 }}><span className="muted">Advice: </span>{rx.advice}</p> : null}
      {rx.followUpDays ? <p className="small" style={{ margin: 0 }}><span className="muted">Follow up in </span>{rx.followUpDays} days</p> : null}
    </div>
  );
}

function History({ customerId, exclude, me }: { customerId: string; exclude: string; me?: DoctorMe }) {
  const { data, pending, error } = useGet<PatientHistory>(`/doctor/patients/${customerId}`, { staleMs: 60_000 });
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
        <ol className="visit-rail">
          {visits.map((v) => (
            <li key={v.id}>
              <button type="button" className="visit-head" onClick={() => setOpen(open === v.id ? null : v.id)} aria-expanded={open === v.id}>
                <span className="cell-main">
                  <strong>{fmtDay(v.startsAt)}</strong>
                  <span className="cell-sub">{v.prescription?.diagnosis || v.reason || CHANNEL[v.channel]}{v.prescription?.items.length ? ` · ${v.prescription.items.length} medicines` : ''}</span>
                </span>
                <span className={`chip ${statusTone(v.status)}`}>{statusLabel(v.status)}</span>
              </button>
              {open === v.id ? <div style={{ marginTop: 10 }}><Outcome b={{ ...v, customer: data.patient }} me={me} /></div> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">First visit with you.</p>
      )}
    </div>
  );
}

interface Med { id: string; name: string; genericName?: string | null; strength?: string | null; form?: string | null }

/** Medicine name field that suggests matches from the pharmacy catalogue, so the patient can order exactly what was written. */
function MedicineInput({ value, index, onPick, onChange }: { value: string; index: number; onPick: (m: Med) => void; onChange: (v: string) => void }) {
  const [hits, setHits] = useState<Med[]>([]);
  const [open, setOpen] = useState(false);
  const typed = useRef(false);
  useEffect(() => {
    const q = value.trim();
    if (!typed.current || q.length < 2) {
      setHits([]);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(() => {
      void api
        .get<{ items: Med[] }>(`/medicines?q=${encodeURIComponent(q)}`)
        .then((r) => !ac.signal.aborted && setHits(r.items.slice(0, 6)))
        .catch(() => undefined);
    }, 220);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [value]);

  return (
    <div className="med-input span">
      <input
        className="input"
        placeholder={`Medicine ${index + 1} — type to search the pharmacy`}
        maxLength={160}
        value={value}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          typed.current = true;
          setOpen(true);
          onChange(e.target.value);
        }}
      />
      {open && hits.length ? (
        <ul className="med-hits" role="listbox">
          {hits.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  typed.current = false;
                  setHits([]);
                  setOpen(false);
                  onPick(m);
                }}
              >
                <strong>{m.name}</strong>
                <span className="muted small">{[m.genericName, m.strength, m.form].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Composer({ b, me, lastRx, onDone }: { b: Booking; me?: DoctorMe; lastRx: Rx | null; onDone: () => void }) {
  const draft = loadDraft(b.id);
  const [rx, setRx] = useState<Rx>(draft?.rx ?? EMPTY_RX);
  const [notes, setNotes] = useState(draft?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<RxTemplate[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(draft ? Date.now() : null);
  useEffect(() => setTemplates(loadTemplates()), []);

  // Keep a draft so a dropped call or closed sheet loses nothing.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(b.id), JSON.stringify({ rx, notes }));
        setSavedAt(Date.now());
      } catch {
        /* storage blocked */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [b.id, rx, notes]);

  const filled = rx.items.filter((i) => i.medicine.trim());
  const blank = !filled.length && !rx.diagnosis.trim() && !rx.advice.trim();
  const setItem = (n: number, patch: Partial<RxItem>) => setRx((r) => ({ ...r, items: r.items.map((it, i) => (i === n ? { ...it, ...patch } : it)) }));
  const removeItem = (n: number) => setRx((r) => ({ ...r, items: r.items.length > 1 ? r.items.filter((_, i) => i !== n) : [{ ...EMPTY_ITEM }] }));
  const move = (n: number, by: number) =>
    setRx((r) => {
      const items = [...r.items];
      const [it] = items.splice(n, 1);
      items.splice(Math.max(0, Math.min(items.length, n + by)), 0, it!);
      return { ...r, items };
    });

  async function apply(src: Rx, what: string) {
    if (!blank && !(await confirmAction({ title: `Replace with ${what}?`, message: 'What you have written so far will be replaced.', confirm: 'Replace' }))) return;
    setRx({ ...src, items: src.items.length ? src.items.map((i) => ({ ...i })) : [{ ...EMPTY_ITEM }] });
    haptic('light');
  }

  async function saveTemplate() {
    if (!filled.length) return toast('Add at least one medicine first', 'bad');
    const name = await promptText({ title: 'Save as template', message: 'Reuse this prescription for similar cases.', placeholder: 'e.g. Viral fever, adult', initial: rx.diagnosis, confirm: 'Save', required: true });
    if (!name?.trim()) return;
    const next = [{ name: name.trim(), rx: { ...rx, items: filled } }, ...templates.filter((t) => t.name !== name.trim())];
    setTemplates(next);
    saveTemplates(next);
    toast('Template saved');
  }

  async function close(status: 'COMPLETED' | 'NO_SHOW') {
    if (status === 'NO_SHOW' && !(await confirmAction({ title: 'Mark as no-show?', message: 'Use this when the patient never joined the call.', confirm: 'No-show', destructive: true }))) return;
    if (status === 'COMPLETED' && blank) {
      const ok = await confirmAction({ title: 'Complete without a prescription?', message: 'The patient will not receive any written advice.', confirm: 'Complete' });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api.patch(`/doctor/bookings/${b.id}`, {
        status,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(status === 'COMPLETED' && !blank ? { prescription: { ...rx, items: filled } } : {}),
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
      {lastRx || templates.length ? (
        <div className="hscroll chips-row" aria-label="Start from">
          {lastRx ? (
            <button type="button" className="chip live" onClick={() => void apply(lastRx, 'the last prescription')}>↻ Repeat last ℞</button>
          ) : null}
          {templates.map((t) => (
            <button key={t.name} type="button" className="chip" onClick={() => void apply(t.rx, `“${t.name}”`)}>{t.name}</button>
          ))}
        </div>
      ) : null}

      <label className="field">
        <span>Diagnosis</span>
        <input className="input" value={rx.diagnosis} maxLength={300} placeholder="e.g. Acute gastritis" onChange={(e) => setRx({ ...rx, diagnosis: e.target.value })} />
      </label>

      <div className="day-head">
        <strong>Medicines</strong>
        <span className="muted small">{filled.length} of 20</span>
      </div>
      {rx.items.map((it, n) => (
        <div key={n} className="rx-item">
          <div className="rx-item-head span">
            <span className="rx-n">{n + 1}</span>
            <span className="grow" />
            {it.medicineId ? <span className="chip ok small" title="The patient can order this exact medicine in one tap">In pharmacy</span> : null}
            {n > 0 ? <button type="button" className="bare-btn muted" aria-label="Move up" onClick={() => move(n, -1)}>↑</button> : null}
            {n < rx.items.length - 1 ? <button type="button" className="bare-btn muted" aria-label="Move down" onClick={() => move(n, 1)}>↓</button> : null}
            <button type="button" className="bare-btn muted" aria-label="Remove medicine" onClick={() => removeItem(n)}>✕</button>
          </div>
          <MedicineInput
            value={it.medicine}
            index={n}
            onChange={(v) => setItem(n, { medicine: v, medicineId: undefined })}
            onPick={(m) => setItem(n, { medicine: m.name, medicineId: m.id, dose: it.dose || (m.strength ?? '') })}
          />
          <input className="input" placeholder="Dose (20 mg)" maxLength={60} value={it.dose} onChange={(e) => setItem(n, { dose: e.target.value })} />
          <input className="input" inputMode="numeric" placeholder="Days" aria-label="Days" value={it.days || ''} onChange={(e) => setItem(n, { days: Math.min(365, Number(e.target.value.replace(/\D/g, '')) || 0) })} />
          <div className="span hscroll chips-row" aria-label="How often">
            {FREQ.map((f) => (
              <button key={f.code} type="button" className={`chip freq${it.frequency === f.code ? ' live' : ''}`} onClick={() => setItem(n, { frequency: f.code })}>
                <b>{f.code}</b>
                <small>{f.label}</small>
              </button>
            ))}
          </div>
          <div className="span hscroll chips-row" aria-label="For how long">
            {DAYS.map((d) => (
              <button key={d} type="button" className={`chip${it.days === d ? ' live' : ''}`} onClick={() => setItem(n, { days: d })}>{d} days</button>
            ))}
          </div>
          <div className="span hscroll chips-row" aria-label="Instructions">
            {INSTR.map((f) => (
              <button key={f} type="button" className={`chip${it.instructions === f ? ' live' : ''}`} onClick={() => setItem(n, { instructions: it.instructions === f ? '' : f })}>{f}</button>
            ))}
          </div>
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
        <RxView rx={{ ...rx, items: filled }} patient={b.customer.name} me={me} when={b.startsAt} />
      </details>
      <div className="row between">
        <span className="muted small">{savedAt ? '✓ Draft saved on this device' : ''}</span>
        <button type="button" className="btn small ghost" onClick={() => void saveTemplate()}>Save as template</button>
      </div>

      <div className="actions sticky-actions">
        <button className="btn danger" disabled={busy} onClick={() => void close('NO_SHOW')}>No-show</button>
        <button className="btn primary" disabled={busy} onClick={() => void close('COMPLETED')}>
          {busy ? 'Saving…' : blank ? 'Complete visit' : `Send ℞ & complete${filled.length ? ` · ${filled.length}` : ''}`}
        </button>
      </div>
    </div>
  );
}
