const dhaka = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', ...opts });

const timeFmt = dhaka({ hour: 'numeric', minute: '2-digit', hour12: true });
const dayFmt = dhaka({ weekday: 'short', day: 'numeric', month: 'short' });
const shortDayFmt = dhaka({ day: 'numeric', month: 'short' });
const weekdayFmt = dhaka({ weekday: 'short' });

/** Always Bangladesh time, whatever timezone the device is set to. */
export const fmtTime = (d: string | Date) => timeFmt.format(new Date(d));
export const fmtDay = (d: string | Date) => dayFmt.format(new Date(d));
export const fmtShortDay = (d: string | Date) => shortDayFmt.format(new Date(d));
export const fmtWeekday = (d: string | Date) => weekdayFmt.format(new Date(d));
export const fmtWhen = (d: string | Date) => `${fmtDay(d)}, ${fmtTime(d)}`;
export const fmtWindow = (a: string | Date, b: string | Date) => `${fmtDay(a)}, ${fmtTime(a)} – ${fmtTime(b)}`;

/** "in 12 min", "3 h ago": for countdowns and live lists. */
export function fmtRelative(d: string | Date, now = Date.now()) {
  const diff = new Date(d).getTime() - now;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  let text: string;
  if (min < 1) return diff >= 0 ? 'now' : 'just now';
  if (min < 60) text = `${min} min`;
  else if (min < 48 * 60) text = `${Math.round(min / 60)} h`;
  else text = `${Math.round(min / 1440)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

const STATUS: Record<string, string> = {
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  ASSIGNED: 'Rider assigned',
  OUT_FOR_DELIVERY: 'On the way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED: 'Delivery failed',
  HOLD: 'Awaiting payment',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
  REFUNDED: 'Refunded',
  UNPAID: 'Unpaid',
  PENDING: 'Pending',
  PAID: 'Paid',
};
/** Human words for every enum the API sends. */
export const statusLabel = (s: string) => STATUS[s] ?? s.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Colour family for a status chip. */
export function statusTone(s: string): 'ok' | 'warn' | 'off' | 'bad' | 'live' {
  if (s === 'DELIVERED' || s === 'COMPLETED' || s === 'PAID') return 'ok';
  if (s === 'CANCELLED' || s === 'REFUNDED' || s === 'NO_SHOW') return 'off';
  if (s === 'FAILED') return 'bad';
  if (s === 'OUT_FOR_DELIVERY' || s === 'ASSIGNED') return 'live';
  return 'warn';
}

export const ORDER_STEPS = ['PLACED', 'CONFIRMED', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';
}
