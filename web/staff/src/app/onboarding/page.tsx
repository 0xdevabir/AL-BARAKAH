'use client';

import { DoctorCard, DoctorProfileView, haptic, invalidate, Segmented, SkeletonList, toast } from '@albarakah/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  AboutFields, bodyFrom, CallFields, formFrom, meetLinkBad, phoneBad, PhotoPicker, previewOf, type ProfileForm,
} from '@/components/DoctorProfileFields';
import { api, useApi, useGet } from '@/lib/api';
import { message } from '@/lib/app';
import { CHANNEL, type DoctorMe, type Window, WEEKDAYS } from '@/lib/doctor';

const WORK = [6, 0, 1, 2, 3, 4];
const HOURS: { id: string; name: string; sub: string; days: number[]; windows: [number, number][] }[] = [
  { id: 'eve', name: 'Evenings', sub: 'Sat–Thu · 5–9 pm', days: WORK, windows: [[17, 21]] },
  { id: 'morn', name: 'Mornings', sub: 'Sat–Thu · 9 am–1 pm', days: WORK, windows: [[9, 13]] },
  { id: 'split', name: 'Split day', sub: 'Sat–Thu · 10–1 & 5–9', days: WORK, windows: [[10, 13], [17, 21]] },
  { id: 'wknd', name: 'Weekends', sub: 'Fri & Sat · 10 am–4 pm', days: [5, 6], windows: [[10, 16]] },
];
const STEPS = ['About you', 'Calls', 'Hours', 'Go live'] as const;

const hoursLine = (w: Window[]) => {
  const days = [...new Set(w.map((x) => x.weekday))];
  return `${days.length} day${days.length === 1 ? '' : 's'} a week · ${Math.round(w.reduce((n, x) => n + x.endMinute - x.startMinute, 0) / 60)} h`;
};

/**
 * First-run setup for an invited doctor: profile, call links, hours, then a preview of the store card
 * before going live. Each step saves as it goes, so leaving halfway loses nothing.
 */
export default function DoctorOnboarding() {
  const router = useRouter();
  const { user, ready } = useApi();
  const isDoctor = user?.role === 'DOCTOR';
  const { data: me, pending, error } = useGet<DoctorMe>(isDoctor ? '/doctor/me' : null);
  const [f, setF] = useState<ProfileForm | null>(null);
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState<string | null>(null);
  const [slot, setSlot] = useState<'15' | '20' | '30'>('20');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'card' | 'profile'>('card');

  useEffect(() => {
    if (ready && !isDoctor) router.replace('/login');
  }, [ready, isDoctor, router]);

  // Resume where the doctor left off.
  useEffect(() => {
    if (!me || f) return;
    if (me.onboardedAt) {
      router.replace('/doctor');
      return;
    }
    const form = formFrom(me);
    setF(form);
    const aboutDone = !!form.qualifications.trim() && form.bio.trim().length >= 30;
    const callsDone = (!me.channels.includes('GOOGLE_MEET') || !!me.meetLink) && (!me.channels.includes('WHATSAPP') || !!me.whatsapp);
    setStep(!aboutDone ? 0 : !callsDone ? 1 : !me.availability.length ? 2 : 3);
  }, [me, f, router]);

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => setF((prev) => (prev ? { ...prev, [k]: v } : prev));

  const blocker = useMemo(() => {
    if (!f || !me) return null;
    if (step === 0) {
      if (f.name.trim().length < 2) return 'Add your name';
      if (!f.qualifications.trim()) return 'Add your qualifications';
      if (f.bio.trim().length < 30) return 'Write a little more about yourself';
    }
    if (step === 1) {
      if (me.channels.includes('GOOGLE_MEET') && (!f.meetLink.trim() || meetLinkBad(f.meetLink))) return 'Add your Google Meet room link';
      if (me.channels.includes('WHATSAPP') && (!f.whatsapp.trim() || phoneBad(f.whatsapp))) return 'Add your WhatsApp number';
    }
    if (step === 2 && !preset && !me.availability.length) return 'Choose when you can consult';
    return null;
  }, [f, me, step, preset]);

  async function next() {
    if (!f || !me || blocker) return;
    setBusy(true);
    try {
      if (step <= 1) await api.put('/doctor/profile', bodyFrom(f));
      if (step === 2 && preset) {
        const p = HOURS.find((h) => h.id === preset)!;
        const windows = p.days.flatMap((weekday) => p.windows.map(([s, e]) => ({ weekday, startMinute: s * 60, endMinute: e * 60, slotMinutes: Number(slot) })));
        await api.put('/doctor/availability', { windows });
      }
      if (step === 3) {
        await api.post('/doctor/onboarding/complete');
        haptic('success');
        toast('You’re live. Patients can book you now.');
        invalidate('/doctor/me');
        invalidate('/doctor/summary');
        router.replace('/doctor');
        return;
      }
      invalidate('/doctor/me');
      haptic('light');
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      haptic('warning');
      toast(message(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !isDoctor || pending || !me || !f) {
    return (
      <main className="ob">
        <div className="ob-card">{error ? <p className="error">{error.message}</p> : <SkeletonList rows={4} />}</div>
      </main>
    );
  }

  const preview = previewOf(me, f);
  const firstName = f.name.replace(/^Dr\.?\s*/i, '').split(/\s+/)[0] || 'Doctor';

  return (
    <main className="ob">
      <div className="ob-card screen">
        <header className="ob-top">
          <span className="ob-brand">BarakaBari · Doctors</span>
          <ol className="ob-steps" aria-label="Setup steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i === step ? 'on' : i < step ? 'done' : undefined}>
                <button type="button" disabled={i > step || busy} onClick={() => setStep(i)}>
                  <b>{i < step ? '✓' : i + 1}</b><span>{s}</span>
                </button>
              </li>
            ))}
          </ol>
        </header>

        {step === 0 ? (
          <section className="stack">
            <div>
              <h1 className="ob-title">Welcome, {firstName} 👋</h1>
              <p className="muted">Let’s set up the profile patients see when they choose a doctor. About five minutes.</p>
            </div>
            <PhotoPicker me={me} f={f} set={set} />
            <AboutFields f={f} set={set} />
          </section>
        ) : null}

        {step === 1 ? (
          <section className="stack">
            <div>
              <h1 className="ob-title">How you’ll talk to patients</h1>
              <p className="muted">BarakaBari set you up for {me.channels.map((c) => CHANNEL[c]).join(' and ')} consultations. Patients get these details only after they pay.</p>
            </div>
            <CallFields me={me} f={f} set={set} />
          </section>
        ) : null}

        {step === 2 ? (
          <section className="stack">
            <div>
              <h1 className="ob-title">When can you consult?</h1>
              <p className="muted">Pick a starting pattern. You can fine-tune every day later under Hours.</p>
            </div>
            {me.availability.length ? (
              <button type="button" className={`ob-option${!preset ? ' on' : ''}`} onClick={() => setPreset(null)}>
                <strong>Keep my current hours</strong>
                <span className="muted small">{hoursLine(me.availability)}</span>
              </button>
            ) : null}
            <div className="ob-options">
              {HOURS.map((h) => (
                <button key={h.id} type="button" className={`ob-option${preset === h.id ? ' on' : ''}`} onClick={() => { setPreset(h.id); haptic('light'); }}>
                  <strong>{h.name}</strong>
                  <span className="muted small">{h.sub}</span>
                </button>
              ))}
            </div>
            {preset ? (
              <div className="field">
                <span>Each consultation lasts</span>
                <Segmented value={slot} onChange={setSlot} label="Consultation length" options={[{ value: '15', label: '15 min' }, { value: '20', label: '20 min' }, { value: '30', label: '30 min' }]} />
                <span className="muted small">
                  {(() => {
                    const p = HOURS.find((h) => h.id === preset)!;
                    const perDay = p.windows.reduce((n, [s, e]) => n + Math.floor(((e - s) * 60) / Number(slot)), 0);
                    return `About ${perDay} patients a day on ${p.days.map((d) => WEEKDAYS[d]!.slice(0, 3)).join(', ')}.`;
                  })()}
                </span>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 3 ? (
          <section className="stack">
            <div>
              <h1 className="ob-title">This is how patients see you</h1>
              <p className="muted">Check it over. When you go live you appear in the BarakaBari app and patients can book your open times.</p>
            </div>
            <Segmented value={view} onChange={setView} label="Preview" options={[{ value: 'card', label: 'In the list' }, { value: 'profile', label: 'Full profile' }]} />
            <div className="ob-preview">
              {view === 'card' ? (
                <DoctorCard d={preview} footer={<><span className="grow muted small">Next free time shows here</span><span className="btn primary small" aria-hidden="true">Book</span></>} />
              ) : (
                <DoctorProfileView d={preview} />
              )}
            </div>
            <ul className="ob-check">
              <li className="done">Profile and qualifications</li>
              <li className="done">{me.channels.map((c) => CHANNEL[c]).join(' & ')} ready</li>
              <li className={me.availability.length ? 'done' : undefined}>{me.availability.length ? `Hours set · ${hoursLine(me.availability)}` : 'Consulting hours missing'}</li>
            </ul>
          </section>
        ) : null}

        <footer className="ob-foot">
          {step > 0 ? <button type="button" className="btn ghost" disabled={busy} onClick={() => setStep(step - 1)}>Back</button> : <span />}
          <span className="grow" />
          {blocker ? <span className="muted small ob-hint">{blocker}</span> : null}
          <button type="button" className="btn primary" disabled={busy || !!blocker} onClick={() => void next()}>
            {busy ? 'Saving…' : step === 3 ? 'Go live' : 'Continue'}
          </button>
        </footer>
      </div>
    </main>
  );
}
