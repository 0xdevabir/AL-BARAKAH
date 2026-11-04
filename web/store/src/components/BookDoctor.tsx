'use client';

import { formatTk } from '@albarakah/domain';
import { fmtTime, haptic, initials, Skeleton } from '@albarakah/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, useGet } from '@/lib/api';
import { byDay, CHANNEL, type Channel, dayName, type Doctor, hue, partsOf, type Slot } from '@/lib/doctors';

const REASONS = ['Fever', 'Cold & cough', 'Stomach', 'Skin', 'Child health', 'Follow-up', 'Report review'];

export function DoctorAvatar({ d, size = 52 }: { d: Pick<Doctor, 'id' | 'name'>; size?: number }) {
  const h = hue(d.id);
  return (
    <span className="doc-avatar" style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${h} 45% 90%)`, color: `hsl(${h} 45% 28%)` }} aria-hidden="true">
      {initials(d.name.replace(/^Dr\.?\s*/i, ''))}
    </span>
  );
}

/**
 * Booking in two calm steps: pick a time (day strip, then grouped times) and how to talk,
 * then review everything with the price before paying.
 */
export function BookDoctor({ doctor, fee, onDone }: { doctor: Doctor; fee: number; onDone?: () => void }) {
  const router = useRouter();
  const { data: slots, pending, error: slotErr } = useGet<Slot[]>(`/doctors/${doctor.id}/slots`, { staleMs: 30_000 });
  const days = useMemo(() => byDay(slots ?? []), [slots]);
  const [dayKey, setDayKey] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [channel, setChannel] = useState<Channel>(doctor.channels[0] ?? 'GOOGLE_MEET');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'time' | 'review'>('time');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dayKey && days[0]) setDayKey(days[0].key);
  }, [days, dayKey]);
  const day = days.find((d) => d.key === dayKey) ?? days[0];

  function pick(s: Slot) {
    haptic('light');
    setSlot(s);
  }

  async function book() {
    if (!slot) return;
    if (!api.ready) await api.restore();
    if (!api.user) {
      router.push('/login?next=/doctors');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const c = await api.post<{ id: string }>('/consultations', {
        doctorId: doctor.id,
        startsAt: slot.start,
        channel,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      haptic('success');
      const { redirectUrl } = await api.post<{ redirectUrl: string }>('/payments/start', { purpose: 'CONSULTATION', refId: c.id });
      onDone?.();
      location.href = redirectUrl;
    } catch (err) {
      setError((err as Error).message);
      // The slot may have just been taken: send them back to choose another.
      setSlot(null);
      setStep('time');
    } finally {
      setBusy(false);
    }
  }

  const head = (
    <div className="book-doc">
      <DoctorAvatar d={doctor} size={46} />
      <span className="grow" style={{ minWidth: 0 }}>
        <strong className="ellipsis" style={{ display: 'block' }}>{doctor.name}</strong>
        <span className="muted small">{doctor.specialty} · BMDC {doctor.bmdcNo}</span>
      </span>
      <span className="price">{formatTk(fee)}</span>
    </div>
  );

  const steps = (
    <ol className="book-steps" aria-label="Steps">
      <li className={step === 'time' ? 'on' : 'done'} onClick={() => setStep('time')}>Time</li>
      <li className={step === 'review' ? 'on' : undefined}>Review &amp; pay</li>
    </ol>
  );

  if (step === 'review' && slot) {
    return (
      <div className="stack book">
        {steps}
        {head}
        <div className="book-summary">
          <div><span className="muted small">When</span><strong>{dayName(slot.start)}, {fmtTime(slot.start)} – {fmtTime(slot.end)}</strong></div>
          <div><span className="muted small">How</span><strong>{CHANNEL[channel].icon} {CHANNEL[channel].label}</strong></div>
          {reason.trim() ? <div><span className="muted small">About</span><strong>{reason.trim()}</strong></div> : null}
          <div className="book-total"><span>Consultation fee</span><strong className="price">{formatTk(fee)}</strong></div>
        </div>
        <ol className="book-next">
          <li><b>1</b><span>Pay with bKash to confirm. The slot is held for you meanwhile.</span></li>
          <li><b>2</b><span>{channel === 'GOOGLE_MEET' ? 'A Join button appears 10 minutes before the call.' : `The doctor calls ${api.user?.phone ?? 'your number'} on WhatsApp at the time.`}</span></li>
          <li><b>3</b><span>Your prescription arrives in the app right after, and you can order the medicines in one tap.</span></li>
        </ol>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="btn primary block" type="button" disabled={busy} onClick={() => void book()}>
          {busy ? 'Booking…' : `Pay ${formatTk(fee)} with bKash`}
        </button>
        <button className="btn ghost block small" type="button" onClick={() => setStep('time')}>Change time</button>
      </div>
    );
  }

  return (
    <div className="stack book">
      {steps}
      {head}

      <div className="field">
        <span>Choose a day</span>
        {pending ? <Skeleton h={68} r={16} /> : null}
        {slotErr ? <p className="error">{slotErr.message}</p> : null}
        {slots && !days.length ? <p className="notice">No free times in the next week. Please check back later or pick another doctor.</p> : null}
        {days.length ? (
          <div className="day-strip" role="tablist" aria-label="Day">
            {days.map((d) => {
              const on = d.key === day?.key;
              const date = new Date(d.date);
              return (
                <button key={d.key} type="button" role="tab" aria-selected={on} className={`day-pill${on ? ' on' : ''}`} onClick={() => setDayKey(d.key)}>
                  <span className="dp-week">{dayName(d.date).startsWith('To') ? dayName(d.date) : date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Asia/Dhaka' })}</span>
                  <strong>{date.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Dhaka' })}</strong>
                  <span className="dp-count">{d.slots.length} free</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {day ? (
        <div className="field">
          <span>Choose a time</span>
          {partsOf(day.slots).map((p) => (
            <div key={p.name} className="time-part">
              <span className="muted small">{p.icon} {p.name}</span>
              <div className="time-grid" role="radiogroup" aria-label={p.name}>
                {p.slots.map((s) => (
                  <button key={s.start} type="button" role="radio" aria-checked={slot?.start === s.start} className={`time-chip${slot?.start === s.start ? ' on' : ''}`} onClick={() => pick(s)}>
                    {fmtTime(s.start)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="field">
        <span>How would you like to talk?</span>
        <div className="channel-grid" role="radiogroup" aria-label="Call type">
          {doctor.channels.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={channel === c} className={`channel-card${channel === c ? ' on' : ''}`} onClick={() => setChannel(c)}>
              <span className="channel-icon" aria-hidden="true">{CHANNEL[c].icon}</span>
              <strong>{CHANNEL[c].label}</strong>
              <span className="muted small">{CHANNEL[c].hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>What is it about? <span className="muted small">(optional)</span></span>
        <div className="row wrap" style={{ gap: 6 }}>
          {REASONS.map((r) => (
            <button key={r} type="button" className={`chip${reason === r ? ' live' : ''}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>
          ))}
        </div>
        <textarea className="input" value={reason} placeholder="Describe your symptoms, how long, any medicines you take" onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </div>

      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn primary block" type="button" disabled={!slot} onClick={() => setStep('review')}>
        {slot ? `Continue · ${dayName(slot.start)}, ${fmtTime(slot.start)}` : 'Pick a time to continue'}
      </button>
    </div>
  );
}
