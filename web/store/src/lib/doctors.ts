import { type DoctorPublic, fmtTime } from '@albarakah/ui';

export type Channel = 'GOOGLE_MEET' | 'WHATSAPP' | 'IN_APP';
export interface Slot { start: string; end: string }
export interface Doctor extends DoctorPublic {
  id: string;
  name: string;
  specialty: string;
  bmdcNo: string;
  bio?: string | null;
  feePoisha?: number | null;
  channels: Exclude<Channel, 'IN_APP'>[];
  nextSlot?: Slot | null;
  openSlots?: number;
  consultations?: number;
}

export const CHANNEL: Record<Channel, { label: string; hint: string; icon: string }> = {
  GOOGLE_MEET: { label: 'Video call', hint: 'Google Meet link, no app needed', icon: '🎥' },
  WHATSAPP: { label: 'WhatsApp call', hint: 'The doctor calls your number', icon: '📞' },
  IN_APP: { label: 'Instant video call', hint: 'Opens in your browser once the doctor picks up', icon: '⚡' },
};

/** Calendar day in Bangladesh, e.g. "2026-11-04", whatever the device timezone. */
export const dhakaDay = (d: string | number | Date) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
const dhakaHour = (d: string | Date) => Number(new Date(d).toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Dhaka' }));

/** "Today", "Tomorrow" or "Fri 7 Nov". */
export function dayName(d: string | Date, now = Date.now()) {
  const k = dhakaDay(d);
  if (k === dhakaDay(now)) return 'Today';
  if (k === dhakaDay(now + 86_400_000)) return 'Tomorrow';
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Dhaka' });
}

/** Short "next free" line for a doctor card. */
export const nextLine = (s: Slot, now = Date.now()) => `${dayName(s.start, now)}, ${fmtTime(s.start)}`;

export interface Day { key: string; date: string; slots: Slot[] }
export function byDay(slots: Slot[]): Day[] {
  const days = new Map<string, Day>();
  for (const s of slots) {
    const key = dhakaDay(s.start);
    const d = days.get(key) ?? { key, date: s.start, slots: [] };
    d.slots.push(s);
    days.set(key, d);
  }
  return [...days.values()];
}

export const PARTS = [
  { name: 'Morning', icon: '🌅', test: (h: number) => h < 12 },
  { name: 'Afternoon', icon: '☀️', test: (h: number) => h >= 12 && h < 17 },
  { name: 'Evening', icon: '🌙', test: (h: number) => h >= 17 },
] as const;
export const partsOf = (slots: Slot[]) =>
  PARTS.map((p) => ({ ...p, slots: slots.filter((s) => p.test(dhakaHour(s.start))) })).filter((p) => p.slots.length);

/** "2 h 10 min", "3 days": a friendly countdown. */
export function countdown(ms: number) {
  if (ms <= 0) return 'now';
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const days = Math.round(h / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** A stable soft colour per doctor so avatars are easy to tell apart. */
export function hue(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Google Calendar "add event" link, so patients get a reminder on their phone. */
export function calendarLink(title: string, start: string, end: string, details: string) {
  const f = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${f(start)}/${f(end)}`, details });
  return `https://calendar.google.com/calendar/render?${q}`;
}
