'use client';

import { chooseAction, confirmAction, haptic, invalidate, LargeTitle, SkeletonList, Switch, toast } from '@albarakah/ui';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api, useGet } from '@/lib/api';
import { hhmmToMinutes, message, minutesToHHMM } from '@/lib/app';
import { type DoctorMe, type Window, WEEKDAYS } from '@/lib/doctor';

const SLOTS = [10, 15, 20, 30, 45, 60];
// Saturday-first, the Bangladeshi working week.
const ORDER = [6, 0, 1, 2, 3, 4, 5];
const strip = (w: Window[]) => w.map(({ weekday, startMinute, endMinute, slotMinutes }) => ({ weekday, startMinute, endMinute, slotMinutes }));
const sortW = (w: Window[]) => [...w].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);

const WORK = [6, 0, 1, 2, 3, 4];
const PRESETS: { name: string; days: number[]; windows: [number, number][] }[] = [
  { name: 'Evenings · Sat–Thu 5–9 pm', days: WORK, windows: [[17, 21]] },
  { name: 'Mornings · Sat–Thu 9 am–1 pm', days: WORK, windows: [[9, 13]] },
  { name: 'Split · 10–1 & 5–9', days: WORK, windows: [[10, 13], [17, 21]] },
  { name: 'Weekend · Fri & Sat 10–4', days: [5, 6], windows: [[10, 16]] },
];
// The week grid shows 7 am to midnight.
const pos = (min: number) => Math.min(100, Math.max(0, ((min - 7 * 60) / (17 * 60)) * 100));
const fmtHours = (w: Window[]) => {
  const m = w.reduce((n, x) => n + x.endMinute - x.startMinute, 0);
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

function problem(windows: Window[]): string | null {
  for (const w of windows) {
    if (w.startMinute >= w.endMinute) return `${WEEKDAYS[w.weekday]}: start must be before end`;
    if (w.endMinute - w.startMinute < w.slotMinutes) return `${WEEKDAYS[w.weekday]}: the window is shorter than one slot`;
  }
  for (const a of windows)
    for (const b of windows)
      if (a !== b && a.weekday === b.weekday && a.startMinute < b.endMinute && b.startMinute < a.endMinute) return `${WEEKDAYS[a.weekday]}: two windows overlap`;
  return null;
}

export default function Availability() {
  const { data: me, pending } = useGet<DoctorMe>('/doctor/me');
  const saved = useMemo(() => sortW(strip(me?.availability ?? [])), [me]);
  const [w, setW] = useState<Window[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => setW(saved), [saved]);

  const dirty = JSON.stringify(sortW(w)) !== JSON.stringify(saved);
  const err = problem(w);
  const weeklySlots = w.reduce((n, x) => n + Math.floor((x.endMinute - x.startMinute) / x.slotMinutes), 0);

  const update = (i: number, patch: Partial<Window>) => setW((all) => all.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  function add(day: number) {
    const last = w.filter((x) => x.weekday === day).sort((a, b) => b.endMinute - a.endMinute)[0];
    const start = last ? Math.min(last.endMinute + 60, 22 * 60) : 17 * 60;
    setW([...w, { weekday: day, startMinute: start, endMinute: Math.min(start + 180, 1440), slotMinutes: last?.slotMinutes ?? 20 }]);
  }
  async function copyDay(day: number) {
    const pick = await chooseAction(`Copy ${WEEKDAYS[day]}'s hours to…`, [
      { label: 'Every working day (Sat–Thu)', value: 'work' },
      { label: 'Every day', value: 'all' },
    ]);
    if (!pick) return;
    const src = w.filter((x) => x.weekday === day);
    const targets = (pick === 'all' ? ORDER : ORDER.filter((d) => d !== 5)).filter((d) => d !== day);
    setW([...w.filter((x) => !targets.includes(x.weekday)), ...targets.flatMap((d) => src.map((x) => ({ ...x, weekday: d })))]);
    haptic('light');
  }

  async function applyPreset(p: (typeof PRESETS)[number]) {
    if (w.length && !(await confirmAction({ title: `Use “${p.name}”?`, message: 'This replaces the hours below. Nothing is saved until you tap Save.', confirm: 'Replace' }))) return;
    setW(sortW(p.days.flatMap((weekday) => p.windows.map(([s, e]) => ({ weekday, startMinute: s * 60, endMinute: e * 60, slotMinutes: w[0]?.slotMinutes ?? 20 })))));
    haptic('light');
  }

  async function save() {
    if (err) return toast(err, 'bad');
    setBusy(true);
    try {
      await api.put('/doctor/availability', { windows: sortW(w) });
      haptic('success');
      toast('Hours saved');
      invalidate('/doctor');
    } catch (e) {
      toast(message(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <LargeTitle sub={`${weeklySlots} bookable slots a week`}>Hours</LargeTitle>
      {pending ? <SkeletonList rows={7} /> : null}
      {me ? (
        <div className="stack">
          <div className="panel">
            <div className="day-head">
              <strong>Your week</strong>
              <span className="muted small">{fmtHours(w)} a week</span>
            </div>
            <div className="week-grid" aria-hidden="true">
              <div className="wg-axis">{[8, 12, 16, 20].map((h) => <span key={h} style={{ top: `${pos(h * 60)}%` }}>{h === 12 ? '12 pm' : h < 12 ? `${h} am` : `${h - 12} pm`}</span>)}</div>
              {ORDER.map((day) => (
                <div key={day} className="wg-col">
                  <span className="wg-day">{WEEKDAYS[day]!.slice(0, 3)}</span>
                  <div className="wg-track">
                    {w.filter((x) => x.weekday === day).map((x, i) => (
                      <span key={i} className="wg-block" style={{ top: `${pos(x.startMinute)}%`, height: `${Math.max(2, pos(x.endMinute) - pos(x.startMinute))}%` }} title={`${minutesToHHMM(x.startMinute)}–${minutesToHHMM(x.endMinute % 1440)}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="muted small" style={{ margin: '12px 0 6px' }}>Quick start</p>
            <div className="hscroll chips-row">
              {PRESETS.map((p) => (
                <button key={p.name} type="button" className="chip" onClick={() => void applyPreset(p)}>{p.name}</button>
              ))}
            </div>
          </div>
          {ORDER.map((day) => {
            const rows = w.map((x, i) => ({ x, i })).filter(({ x }) => x.weekday === day).sort((a, b) => a.x.startMinute - b.x.startMinute);
            return (
              <div key={day} className="panel">
                <div className="day-head">
                  <strong>{WEEKDAYS[day]}</strong>
                  <span className="row" style={{ gap: 6 }}>
                    {rows.length ? <button className="btn small ghost" onClick={() => void copyDay(day)}>Copy</button> : null}
                    <Switch
                      label={`Available on ${WEEKDAYS[day]}`}
                      checked={rows.length > 0}
                      onChange={(on) => (on ? add(day) : setW(w.filter((x) => x.weekday !== day)))}
                    />
                  </span>
                </div>
                {rows.length ? (
                  <div className="stack" style={{ marginTop: 10 }}>
                    {rows.map(({ x, i }) => (
                      <div key={i} className="window-row">
                        <input className="input" type="time" step={300} aria-label="From" value={minutesToHHMM(x.startMinute)} onChange={(e) => e.target.value && update(i, { startMinute: hhmmToMinutes(e.target.value) })} />
                        <input className="input" type="time" step={300} aria-label="To" value={minutesToHHMM(x.endMinute % 1440)} onChange={(e) => e.target.value && update(i, { endMinute: hhmmToMinutes(e.target.value) || 1440 })} />
                        <select className="input select" aria-label="Slot length" value={x.slotMinutes} onChange={(e) => update(i, { slotMinutes: Number(e.target.value) })}>
                          {SLOTS.map((m) => <option key={m} value={m}>{m} min</option>)}
                        </select>
                        <button className="bare-btn muted" aria-label="Remove window" onClick={() => setW(w.filter((_, n) => n !== i))}>✕</button>
                      </div>
                    ))}
                    <button className="btn small ghost" onClick={() => add(day)}><Icon name="plus" size={16} /> Add hours</button>
                  </div>
                ) : (
                  <p className="muted small" style={{ marginTop: 6 }}>Not available</p>
                )}
              </div>
            );
          })}
          <p className="group-foot">Bookings already made are kept when you change your hours.</p>
        </div>
      ) : null}

      <div className={`savebar${dirty ? ' show' : ''}`} aria-hidden={!dirty}>
        <span className="grow">{err ?? 'Unsaved changes'}</span>
        <button className="btn small ghost" onClick={() => setW(saved)}>Discard</button>
        <button className="btn small primary" disabled={busy || !!err} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  );
}
