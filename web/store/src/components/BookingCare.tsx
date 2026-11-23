'use client';

import { confirmAction, fmtTime, invalidate, promptText, Sheet, toast } from '@albarakah/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api, useGet } from '@/lib/api';
import { byDay, dayName, partsOf, type Slot } from '@/lib/doctors';

interface Options { canCancel: boolean; canReschedule: boolean; reschedulesLeft: number; canRate: boolean; reason: string | null; paid: boolean }
interface CareFile { id: string; name: string; contentType: string; createdAt: string; url: string }
interface Props {
  id: string; doctorId: string; status: string; kind?: 'SCHEDULED' | 'INSTANT';
  rating?: number | null; review?: string | null; cancelledBy?: string | null;
}
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_BYTES = 8 * 1024 * 1024;

/** Everything a patient can do around a booking besides joining the call. */
export function BookingCare({ id, doctorId, status, kind, rating, review, cancelledBy }: Props) {
  const open = ['HOLD', 'CONFIRMED', 'COMPLETED'].includes(status);
  const { data: opts } = useGet<Options>(open ? `/consultations/${id}/options` : null, { staleMs: 15_000 });
  const { data: files } = useGet<CareFile[]>(open ? `/consultations/${id}/files` : null, { staleMs: 60_000 });
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    invalidate(`/consultations/${id}`);
    invalidate('/consultations');
  };

  async function cancel() {
    const ok = await confirmAction({
      title: 'Cancel this consultation?',
      message: opts?.paid ? 'Your bKash payment is refunded to the same number, usually within 3 working days.' : 'The time is released for other patients.',
      confirm: 'Cancel booking', destructive: true,
    });
    if (!ok) return;
    const reason = await promptText({ title: 'Why are you cancelling?', message: 'Optional — it helps the doctor.', confirm: 'Done', placeholder: 'Feeling better, wrong time…' });
    setBusy(true);
    try {
      const r = await api.post<{ refundDue: boolean }>(`/consultations/${id}/cancel`, reason ? { reason } : {});
      toast(r.refundDue ? 'Cancelled. Your refund is on its way.' : 'Booking cancelled');
      refresh();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!ACCEPT.split(',').includes(f.type)) return toast('Use a photo (JPEG, PNG, WebP) or a PDF', 'bad');
    if (f.size > MAX_BYTES) return toast('Files must be under 8 MB', 'bad');
    setBusy(true);
    try {
      const name = f.name.slice(0, 120) || 'Report';
      const { key, url } = await api.post<{ key: string; url: string }>(`/consultations/${id}/files/upload-url`, { contentType: f.type, name });
      const put = await fetch(url, { method: 'PUT', headers: { 'content-type': f.type }, body: f });
      if (!put.ok) throw new Error('The upload failed. Please try again.');
      await api.post(`/consultations/${id}/files`, { key, name, contentType: f.type });
      invalidate(`/consultations/${id}/files`);
      toast('Shared with your doctor');
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open ? (
        <div className="card stack" style={{ gap: 10 }}>
          <div className="row between">
            <strong>Reports & photos</strong>
            <span className="muted small">{files?.length ?? 0}/10</span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>Old prescriptions, test results or a photo of the problem. Only your doctor can see them.</p>
          {files?.length ? (
            <ul className="care-files">
              {files.map((f) => (
                <li key={f.id}>
                  <a href={f.url} target="_blank" rel="noreferrer">{f.contentType === 'application/pdf' ? '📄' : '🖼️'} {f.name}</a>
                </li>
              ))}
            </ul>
          ) : null}
          {status !== 'COMPLETED' && (files?.length ?? 0) < 10 ? (
            <label className={`btn block${busy ? ' disabled' : ''}`}>
              <input type="file" accept={ACCEPT} hidden disabled={busy} onChange={(e) => void upload(e)} />
              {busy ? 'Uploading…' : '+ Add a report or photo'}
            </label>
          ) : null}
        </div>
      ) : null}

      {opts && (opts.canCancel || opts.canReschedule || (!opts.canCancel && opts.reason && status === 'CONFIRMED')) ? (
        <div className="group">
          {opts.canReschedule ? (
            <button className="row between" type="button" onClick={() => setMoving(true)} disabled={busy}>
              <span>Change the time</span>
              <span className="muted small">{opts.reschedulesLeft} change{opts.reschedulesLeft === 1 ? '' : 's'} left ›</span>
            </button>
          ) : null}
          {opts.canCancel ? (
            <button className="row between" type="button" onClick={() => void cancel()} disabled={busy}>
              <span className="bad">Cancel booking</span>
              <span className="muted small">{opts.paid ? 'Full refund' : ''}</span>
            </button>
          ) : opts.reason ? (
            <div className="row"><span className="muted small">{opts.reason}</span></div>
          ) : null}
        </div>
      ) : null}

      {status === 'CANCELLED' || status === 'REFUNDED' ? (
        <p className="notice" style={{ margin: 0 }}>
          {status === 'REFUNDED' ? 'Cancelled and refunded.' : cancelledBy === 'PATIENT' ? 'You cancelled this booking. Any payment is being refunded.' : 'This booking was cancelled.'}
        </p>
      ) : null}

      {status === 'COMPLETED' ? <Rate id={id} canRate={!!opts?.canRate} rating={rating} review={review} onDone={refresh} /> : null}

      {['COMPLETED', 'NO_SHOW', 'CANCELLED', 'REFUNDED'].includes(status) && kind !== 'INSTANT' ? (
        <Link className="btn block" href={`/doctors?doctor=${doctorId}`}>Book this doctor again</Link>
      ) : null}

      {moving ? <Reschedule id={id} doctorId={doctorId} onClose={() => setMoving(false)} onDone={() => { setMoving(false); refresh(); }} /> : null}
    </>
  );
}

function Rate({ id, canRate, rating, review, onDone }: { id: string; canRate: boolean; rating?: number | null; review?: string | null; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (rating) {
    return (
      <div className="card stack" style={{ gap: 4 }}>
        <strong>Your rating</strong>
        <span className="stars" aria-label={`${rating} of 5 stars`}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>
        {review ? <span className="muted small">“{review}”</span> : null}
      </div>
    );
  }
  if (!canRate) return null;
  async function send() {
    setBusy(true);
    try {
      await api.post(`/consultations/${id}/rate`, { rating: stars, ...(text.trim() ? { review: text.trim() } : {}) });
      toast('Thank you for your feedback');
      onDone();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <strong>How was your consultation?</strong>
      <div className="stars-pick" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} className={n <= stars ? 'on' : undefined} onClick={() => setStars(n)}>★</button>
        ))}
      </div>
      {stars ? (
        <>
          <textarea className="input" maxLength={500} rows={2} placeholder="Anything to add? (optional)" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn primary block" type="button" disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : 'Send rating'}</button>
        </>
      ) : null}
    </div>
  );
}

function Reschedule({ id, doctorId, onClose, onDone }: { id: string; doctorId: string; onClose: () => void; onDone: () => void }) {
  const { data: slots, error } = useGet<Slot[]>(`/doctors/${doctorId}/slots`, { staleMs: 15_000 });
  const days = useMemo(() => byDay(slots ?? []), [slots]);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const day = days.find((d) => d.key === dayKey) ?? days[0];

  async function save() {
    if (!slot) return;
    setBusy(true);
    try {
      await api.post(`/consultations/${id}/reschedule`, { startsAt: slot.start });
      toast(`Moved to ${dayName(slot.start)}, ${fmtTime(slot.start)}`);
      invalidate(`/doctors/${doctorId}/slots`);
      onDone();
    } catch (e) {
      toast((e as Error).message, 'bad');
      invalidate(`/doctors/${doctorId}/slots`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Pick a new time">
      <div className="stack">
        {error ? <p className="error">{error.message}</p> : null}
        {slots && !days.length ? <p className="notice">No other free times this week.</p> : null}
        {days.length ? (
          <div className="day-strip" role="tablist" aria-label="Day">
            {days.map((d) => (
              <button key={d.key} type="button" role="tab" aria-selected={d.key === day?.key} className={`day-pill${d.key === day?.key ? ' on' : ''}`} onClick={() => { setDayKey(d.key); setSlot(null); }}>
                <span className="dp-week">{new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Asia/Dhaka' })}</span>
                <strong>{new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Dhaka' })}</strong>
                <span className="dp-count">{d.slots.length} free</span>
              </button>
            ))}
          </div>
        ) : null}
        {day ? partsOf(day.slots).map((p) => (
          <div key={p.name} className="time-part">
            <span className="muted small">{p.icon} {p.name}</span>
            <div className="time-grid" role="radiogroup" aria-label={p.name}>
              {p.slots.map((s) => (
                <button key={s.start} type="button" role="radio" aria-checked={slot?.start === s.start} className={`time-chip${slot?.start === s.start ? ' on' : ''}`} onClick={() => setSlot(s)}>
                  {fmtTime(s.start)}
                </button>
              ))}
            </div>
          </div>
        )) : null}
        <button className="btn primary block" type="button" disabled={!slot || busy} onClick={() => void save()}>
          {busy ? 'Moving…' : slot ? `Move to ${dayName(slot.start)}, ${fmtTime(slot.start)}` : 'Choose a time'}
        </button>
      </div>
    </Sheet>
  );
}
