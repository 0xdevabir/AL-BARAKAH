import { DHAKA_OFFSET_MS, dhakaDayStart, type Slot } from './schedule.js';

export interface AvailabilityWindow {
  weekday: number;
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
}

const MIN = 60_000;
const DAY = 1_440 * MIN;

/** Weekday 0 = Sunday, in Dhaka time. */
export function dhakaWeekday(at: Date): number {
  return new Date(at.getTime() + DHAKA_OFFSET_MS).getUTCDay();
}

/** Bookable start times for a doctor; `taken` are starts held by an active booking. */
export function consultationSlots(
  windows: AvailabilityWindow[],
  now: Date,
  days: number,
  taken: Date[] = [],
  minLeadMinutes = 30,
): Slot[] {
  const takenSet = new Set(taken.map((d) => d.getTime()));
  const earliest = now.getTime() + minLeadMinutes * MIN;
  const today = dhakaDayStart(now);
  const out: Slot[] = [];
  for (let d = 0; d < days; d++) {
    const dayStart = today + d * DAY;
    const weekday = dhakaWeekday(new Date(dayStart));
    for (const w of windows.filter((x) => x.weekday === weekday)) {
      for (let m = w.startMinute; m + w.slotMinutes <= w.endMinute; m += w.slotMinutes) {
        const start = dayStart + m * MIN;
        if (start >= earliest && !takenSet.has(start)) {
          out.push({ start: new Date(start), end: new Date(start + w.slotMinutes * MIN) });
        }
      }
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
