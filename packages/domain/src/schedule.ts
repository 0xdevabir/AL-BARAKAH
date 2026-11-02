/** Bangladesh has no DST, so Asia/Dhaka is always UTC+6. A fixed offset keeps this usable in any runtime. */
export const DHAKA_OFFSET_MS = 6 * 3_600_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface ScheduleConfig {
  leadHours: number;
  openHour: number;
  closeHour: number;
  slotHours: number;
  daysAhead: number;
  emergencyStartHour: number;
  /** Emergency orders must be placed before this hour so delivery lands before closing. */
  emergencyEndHour: number;
  emergencyMinutes: number;
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  leadHours: 6,
  openHour: 8,
  closeHour: 23,
  slotHours: 1,
  daysAhead: 3,
  emergencyStartHour: 8,
  emergencyEndHour: 22,
  emergencyMinutes: 60,
};

export interface Slot {
  start: Date;
  end: Date;
}

/** UTC instant of 00:00 Dhaka on the Dhaka calendar day containing `at`. */
export function dhakaDayStart(at: Date): number {
  return Math.floor((at.getTime() + DHAKA_OFFSET_MS) / DAY) * DAY - DHAKA_OFFSET_MS;
}

export function dhakaHour(at: Date): number {
  return (at.getTime() - dhakaDayStart(at)) / HOUR;
}

/** Every slot a customer may choose: starts at or after now + lead time (rounded up to the hour). */
export function deliverySlots(now: Date, cfg: ScheduleConfig = DEFAULT_SCHEDULE): Slot[] {
  const earliest = Math.ceil((now.getTime() + cfg.leadHours * HOUR) / HOUR) * HOUR;
  const firstDay = dhakaDayStart(now);
  const slots: Slot[] = [];
  for (let d = 0; d <= cfg.daysAhead; d++) {
    for (let h = cfg.openHour; h + cfg.slotHours <= cfg.closeHour; h += cfg.slotHours) {
      const start = firstDay + d * DAY + h * HOUR;
      if (start >= earliest) slots.push({ start: new Date(start), end: new Date(start + cfg.slotHours * HOUR) });
    }
  }
  return slots;
}

/** The server re-checks the client's chosen slot, because the page may have been open for hours. */
export function isValidDeliverySlot(start: Date, now: Date, cfg: ScheduleConfig = DEFAULT_SCHEDULE): boolean {
  return deliverySlots(now, cfg).some((s) => s.start.getTime() === start.getTime());
}

export function isEmergencyAvailable(now: Date, cfg: ScheduleConfig = DEFAULT_SCHEDULE): boolean {
  const h = dhakaHour(now);
  return h >= cfg.emergencyStartHour && h < cfg.emergencyEndHour;
}

export function emergencyDeadline(now: Date, cfg: ScheduleConfig = DEFAULT_SCHEDULE): Date {
  return new Date(now.getTime() + cfg.emergencyMinutes * 60_000);
}
