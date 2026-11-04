'use client';

import { chooseAction, haptic, invalidate, LargeTitle, SkeletonList, Switch, toast } from '@albarakah/ui';
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
