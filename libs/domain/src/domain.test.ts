import { describe, expect, it } from 'vitest';
import {
  canTransition, computeTotals, consultationSlots, DEFAULT_FEES, deliverySlots, dhakaHour, emergencyDeadline,
  formatTk, isEmergencyAvailable, isValidDeliverySlot,
} from './index.js';

/** Build an instant from Dhaka wall-clock time. */
const dhaka = (d: string, t: string) => new Date(`${d}T${t}:00+06:00`);

describe('delivery slots', () => {
  it('order at 10:00 gets 16:00 through the 22:00-23:00 window that day', () => {
    const slots = deliverySlots(dhaka('2026-11-02', '10:00'));
    expect(slots[0]!.start).toEqual(dhaka('2026-11-02', '16:00'));
    const today = slots.filter((s) => s.start < dhaka('2026-11-03', '00:00'));
    expect(today.map((s) => dhakaHour(s.start))).toEqual([16, 17, 18, 19, 20, 21, 22]);
    expect(today.at(-1)!.end).toEqual(dhaka('2026-11-02', '23:00'));
  });
  it('order at 16:00 still gets the final window', () => {
    expect(deliverySlots(dhaka('2026-11-02', '16:00'))[0]!.start).toEqual(dhaka('2026-11-02', '22:00'));
  });
  it('order at 16:40 rolls to tomorrow 08:00', () => {
    expect(deliverySlots(dhaka('2026-11-02', '16:40'))[0]!.start).toEqual(dhaka('2026-11-03', '08:00'));
  });
  it('order at 02:00 starts the same day at 08:00', () => {
    expect(deliverySlots(dhaka('2026-11-02', '02:00'))[0]!.start).toEqual(dhaka('2026-11-02', '08:00'));
  });
  it('order at 23:30 gets 08:00 the next Dhaka day', () => {
    expect(deliverySlots(dhaka('2026-11-02', '23:30'))[0]!.start).toEqual(dhaka('2026-11-03', '08:00'));
  });
  it('order at 01:30 Dhaka, the previous UTC day, is treated as the Dhaka day', () => {
    expect(deliverySlots(dhaka('2026-11-02', '01:30'))[0]!.start).toEqual(dhaka('2026-11-02', '08:00'));
  });
  it('rejects stale and off-grid slots', () => {
    const now = dhaka('2026-11-02', '10:00');
    expect(isValidDeliverySlot(dhaka('2026-11-02', '15:00'), now)).toBe(false);
    expect(isValidDeliverySlot(dhaka('2026-11-02', '16:30'), now)).toBe(false);
    expect(isValidDeliverySlot(dhaka('2026-11-02', '16:00'), now)).toBe(true);
    expect(isValidDeliverySlot(dhaka('2026-11-06', '16:00'), now)).toBe(false);
  });
  it('no slot ends after closing', () => {
    for (const s of deliverySlots(dhaka('2026-11-02', '03:00'))) expect(dhakaHour(s.end)).toBeLessThanOrEqual(23);
  });
});

describe('emergency', () => {
  it('is available 08:00 to before 22:00', () => {
    expect(isEmergencyAvailable(dhaka('2026-11-02', '07:59'))).toBe(false);
    expect(isEmergencyAvailable(dhaka('2026-11-02', '08:00'))).toBe(true);
    expect(isEmergencyAvailable(dhaka('2026-11-02', '21:59'))).toBe(true);
    expect(isEmergencyAvailable(dhaka('2026-11-02', '22:00'))).toBe(false);
  });
  it('promises one hour', () => {
    expect(emergencyDeadline(dhaka('2026-11-02', '10:00'))).toEqual(dhaka('2026-11-02', '11:00'));
  });
});

describe('fees', () => {
  it('adds emergency fee and rider bonus only on emergency', () => {
    const lines = [{ unitPricePoisha: 1250, qty: 3 }];
    expect(computeTotals({ lines, zoneDeliveryFeePoisha: 4000, emergency: false, fees: DEFAULT_FEES }))
      .toMatchObject({ subtotalPoisha: 3750, totalPoisha: 7750, riderPayoutPoisha: 3000, emergencyFeePoisha: 0 });
    expect(computeTotals({ lines, zoneDeliveryFeePoisha: 4000, emergency: true, fees: DEFAULT_FEES }))
      .toMatchObject({ totalPoisha: 17750, riderPayoutPoisha: 5000, emergencyFeePoisha: 10000 });
  });
  it('formats taka', () => {
    expect(formatTk(10000)).toBe('৳100');
    expect(formatTk(1250)).toBe('৳12.50');
    expect(formatTk(123400)).toBe('৳1,234');
  });
});

describe('order state machine', () => {
  it('enforces actors', () => {
    expect(canTransition('PLACED', 'CANCELLED', 'CUSTOMER')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED', 'CUSTOMER')).toBe(false);
    expect(canTransition('ASSIGNED', 'OUT_FOR_DELIVERY', 'RIDER')).toBe(true);
    expect(canTransition('ASSIGNED', 'OUT_FOR_DELIVERY', 'CUSTOMER')).toBe(false);
    expect(canTransition('PACKED', 'DELIVERED', 'ADMIN')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED', 'ADMIN')).toBe(false);
  });
});

describe('consultation slots', () => {
  const now = dhaka('2026-11-02', '09:00'); // a Monday
  const windows = [{ weekday: 1, startMinute: 9 * 60, endMinute: 11 * 60, slotMinutes: 30 }];
  it('applies lead time, weekday and taken slots', () => {
    const slots = consultationSlots(windows, now, 7, [dhaka('2026-11-02', '10:00')]);
    expect(slots.map((s) => dhakaHour(s.start))).toEqual([9.5, 10.5]);
  });
});
