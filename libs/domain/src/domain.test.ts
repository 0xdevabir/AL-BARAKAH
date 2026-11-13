import { describe, expect, it } from 'vitest';
import {
  canTransition, commissionPoisha, computeTotals, consultationSlots, DEFAULT_FEES, deliverySlots, dhakaHour, emergencyDeadline,
  formatTk, isEmergencyAvailable, isValidDeliverySlot, pieceNoun, piecePricePoisha, piecesPerPack,
  dosesPerDay, rxCartQty, rxValid,
} from './index.js';

describe('prescription to cart', () => {
  it('counts doses a day', () => {
    expect(dosesPerDay('1+0+1')).toBe(2);
    expect(dosesPerDay('1+1+1+1')).toBe(4);
    expect(dosesPerDay('½+0+½')).toBe(1);
    expect(dosesPerDay('As needed')).toBe(0);
    expect(dosesPerDay('')).toBe(0);
  });
  it('buys the exact course loose when it is not whole packs', () => {
    expect(rxCartQty('1+0+1', 7, 10)).toEqual({ unit: 'PIECE', qty: 14, pieces: 14 });
    expect(rxCartQty('1+0+1', 5, 10)).toEqual({ unit: 'PACK', qty: 1, pieces: 10 });
  });
  it('buys whole packs for long courses and non-tablets', () => {
    expect(rxCartQty('1+0+0', 30, 10)).toEqual({ unit: 'PACK', qty: 3, pieces: 30 });
    expect(rxCartQty('1+1+1', 30, 14)).toEqual({ unit: 'PACK', qty: 7, pieces: 90 });
    expect(rxCartQty('1+0+1', 5, 0)).toEqual({ unit: 'PACK', qty: 1, pieces: 10 });
    expect(rxCartQty('As needed', 0, 10)).toEqual({ unit: 'PACK', qty: 1, pieces: 0 });
  });
  it('lets an e-prescription buy medicines for 30 days', () => {
    const t = new Date('2026-11-01T00:00:00Z');
    expect(rxValid(t, new Date('2026-11-30T00:00:00Z'))).toBe(true);
    expect(rxValid(t, new Date('2026-12-02T00:00:00Z'))).toBe(false);
  });
});

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
    // Urgent delivery waives the regular delivery charge.
    expect(computeTotals({ lines, zoneDeliveryFeePoisha: 4000, emergency: true, fees: DEFAULT_FEES }))
      .toMatchObject({ totalPoisha: 13750, deliveryFeePoisha: 0, riderPayoutPoisha: 5000, emergencyFeePoisha: 10000 });
  });
  it('takes a whole-percent commission, clamped', () => {
    expect(commissionPoisha(50_000, 20)).toBe(10_000);
    expect(commissionPoisha(50_000, 150)).toBe(50_000);
    expect(commissionPoisha(333, 10)).toBe(33);
  });
  it('pushes rare-medicine orders back by the sourcing days', () => {
    const now = dhaka('2026-11-02', '10:00');
    expect(deliverySlots(now, undefined, 2)[0]!.start).toEqual(dhaka('2026-11-04', '16:00'));
    expect(isValidDeliverySlot(dhaka('2026-11-02', '16:00'), now, undefined, 1)).toBe(false);
    expect(isValidDeliverySlot(dhaka('2026-11-03', '16:00'), now, undefined, 1)).toBe(true);
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
    expect(canTransition('ASSIGNED', 'PACKED', 'RIDER')).toBe(true);
    expect(canTransition('ASSIGNED', 'PACKED', 'ADMIN')).toBe(false);
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

describe('loose pieces', () => {
  it('reads pieces per pack from tablet and capsule pack sizes', () => {
    expect(piecesPerPack('Tablet', "30' pack")).toBe(30);
    expect(piecesPerPack('Capsule', "10's Pack")).toBe(10);
    expect(piecesPerPack('Tablet (Enteric Coated)', '14’s pack')).toBe(14);
    expect(piecesPerPack('Tablet', '20')).toBe(20);
  });
  it('keeps everything else pack-only', () => {
    expect(piecesPerPack('Syrup', "30' pack")).toBe(0);
    expect(piecesPerPack('Tablet', "1' pack")).toBe(0);
    expect(piecesPerPack('Tablet', '10 x 10')).toBe(0);
    expect(piecesPerPack('Tablet', '')).toBe(0);
  });
  it('prices a piece at the pack price split evenly, rounded up', () => {
    expect(piecePricePoisha(3000, 30)).toBe(100);
    expect(piecePricePoisha(1000, 30)).toBe(34);
  });
  it('names the piece', () => {
    expect(pieceNoun('Capsule', 4)).toBe('capsules');
    expect(pieceNoun('Tablet')).toBe('tablet');
  });
});
