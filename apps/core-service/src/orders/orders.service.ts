import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { placeOrderSchema } from '@albarakah/contracts';
import type { OrderStatus, Prisma, PrismaClient, SaleUnit } from '@albarakah/database';
import {
  canTransition, computeTotals, deliverySlots, emergencyDeadline, isEmergencyAvailable, isValidDeliverySlot, type OrderActor,
  pieceNoun, piecePricePoisha, piecesPerPack, restoresStock,
} from '@albarakah/domain';
import type { Redis } from 'ioredis';
import type { z } from 'zod';
import { badRequest, conflict, forbidden, notFound } from '@albarakah/nest-common';
import { PRISMA, REDIS } from '@albarakah/nest-common';
import { rxCoverage } from '../consultations/rx.js';
import { SettingsService } from '../settings/settings.module.js';

export const orderChannel = (orderId: string) => `order:${orderId}`;
export const riderChannel = (riderId: string) => `rider:${riderId}`;
/** Every order change, for the admin live board. */
export const ADMIN_CHANNEL = 'orders:all';
/** Excludes look-alike characters, because customers read codes out over the phone. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function shortCode(prefix: string): string {
  return prefix + Array.from(randomBytes(7), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

type PlaceOrder = z.output<typeof placeOrderSchema>;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly settings: SettingsService,
  ) {}

  async slotsFor(now = new Date()) {
    const s = await this.settings.get();
    return {
      slots: deliverySlots(now, s),
      emergency: { available: isEmergencyAvailable(now, s), feePoisha: s.emergencyFeePoisha, minutes: s.emergencyMinutes },
    };
  }

  async place(customerId: string, input: PlaceOrder, now = new Date()) {
    // A retried request (flaky mobile network) returns the first order instead of creating a second.
    const existing = await this.prisma.order.findUnique({
      where: { customerId_idempotencyKey: { customerId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) return existing;

    const s = await this.settings.get();
    const emergency = input.type === 'EMERGENCY';
    let slotStart: Date | null = null;
    let slotEnd: Date | null = null;
    let promisedBy: Date;
    if (emergency) {
      if (!isEmergencyAvailable(now, s)) throw badRequest('EMERGENCY_UNAVAILABLE', 'Emergency delivery is not available right now');
      promisedBy = emergencyDeadline(now, s);
    } else {
      const chosen = new Date(input.slotStart!);
      if (!isValidDeliverySlot(chosen, now, s)) throw badRequest('SLOT_UNAVAILABLE', 'That delivery time is no longer available. Please choose another.');
      const slot = deliverySlots(now, s).find((x) => x.start.getTime() === chosen.getTime())!;
      slotStart = slot.start;
      slotEnd = slot.end;
      promisedBy = slot.end;
    }

    const address = await this.prisma.address.findFirst({
      where: { id: input.addressId, userId: customerId, isDeleted: false }, include: { zone: true },
    });
    if (!address) throw notFound('Address not found');
    if (!address.zone.isActive) throw badRequest('ZONE_UNAVAILABLE', 'We do not deliver to this area right now');

    // Merge repeated lines. Locking in sorted order means two orders can never deadlock.
    // A medicine can be in the cart twice: once by the pack, once as loose pieces.
    const qtyByKey = new Map<string, { medicineId: string; unit: SaleUnit; qty: number }>();
    for (const i of input.items) {
      const key = `${i.medicineId}|${i.unit}`;
      const prev = qtyByKey.get(key);
      qtyByKey.set(key, { medicineId: i.medicineId, unit: i.unit, qty: (prev?.qty ?? 0) + i.qty });
    }
    const keys = [...qtyByKey.keys()].sort();
    const ids = [...new Set(keys.map((k) => qtyByKey.get(k)!.medicineId))];
    const medicines = await this.prisma.medicine.findMany({ where: { id: { in: ids }, isActive: true } });
    if (medicines.length !== ids.length) throw badRequest('ITEM_UNAVAILABLE', 'An item in your cart is no longer available');
    // The customer's own e-prescription from a consultation here covers the Rx medicines the doctor wrote.
    const coverage = input.consultationId ? await rxCoverage(this.prisma, customerId, input.consultationId, now) : null;
    if (input.consultationId && !coverage) {
      throw badRequest('PRESCRIPTION_EXPIRED', 'That prescription can no longer be used to order. Please upload a prescription or book a follow-up.');
    }
    const uncovered = medicines.filter((m) => m.isRx && !coverage?.medicineIds.has(m.id));
    if (s.requireRxUpload && uncovered.length && !input.prescriptionKey) {
      throw badRequest(
        'PRESCRIPTION_REQUIRED',
        coverage
          ? `${uncovered.map((m) => m.name).join(', ')} ${uncovered.length === 1 ? 'is' : 'are'} not on your doctor's prescription. Please upload a prescription for ${uncovered.length === 1 ? 'it' : 'them'}.`
          : 'Please upload a prescription for the prescription medicines in your cart',
      );
    }
    if (input.prescriptionKey && !input.prescriptionKey.startsWith(`rx/${customerId}/`)) throw forbidden();

    const byId = new Map(medicines.map((m) => [m.id, m]));
    const lines = keys.map((k) => {
      const { medicineId, unit, qty } = qtyByKey.get(k)!;
      const medicine = byId.get(medicineId)!;
      if (unit === 'PACK') return { medicine, unit, qty, perPack: 0, unitPricePoisha: medicine.pricePoisha, nameSnapshot: `${medicine.name} ${medicine.strength}`.trim() };
      const perPack = piecesPerPack(medicine.form, medicine.packSize);
      if (!perPack) throw badRequest('LOOSE_UNAVAILABLE', `${medicine.name} is sold by the pack only`);
      const nameSnapshot = `${medicine.name} ${medicine.strength}`.trim() + ` (loose ${pieceNoun(medicine.form, 2)})`;
      return { medicine, unit, qty, perPack, unitPricePoisha: piecePricePoisha(medicine.pricePoisha, perPack), nameSnapshot };
    });
    const totals = computeTotals({
      lines,
      zoneDeliveryFeePoisha: address.zone.deliveryFeePoisha,
      emergency,
      fees: s,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            code: shortCode('AB'),
            customerId,
            type: input.type,
            slotStart,
            slotEnd,
            promisedBy,
            zoneId: address.zoneId,
            addressSnapshot: { label: address.label, line: address.line, phone: address.phone, notes: address.notes, zone: address.zone.name, lat: address.lat, lng: address.lng },
            ...totals,
            paymentMethod: input.paymentMethod,
            paymentStatus: input.paymentMethod === 'BKASH' ? 'PENDING' : 'UNPAID',
            prescriptionKey: input.prescriptionKey,
            consultationId: coverage?.consultationId,
            notes: input.notes,
            idempotencyKey: input.idempotencyKey,
            events: { create: { toStatus: 'PLACED', actorId: customerId } },
          },
        });
        for (const { medicine, unit, qty, perPack, unitPricePoisha, nameSnapshot } of lines) {
          const item = await tx.orderItem.create({
            data: { orderId: order.id, medicineId: medicine.id, nameSnapshot, unitPricePoisha, unit, qty },
          });
          if (unit === 'PIECE') await this.allocatePieces(tx, medicine.id, medicine.name, item.id, qty, perPack);
          else await this.allocate(tx, medicine.id, medicine.name, item.id, qty);
        }
        return order;
      });
    } catch (err) {
      // Two identical requests can pass the check above together; the unique index picks one winner.
      if ((err as { code?: string }).code === 'P2002') {
        const winner = await this.prisma.order.findUnique({
          where: { customerId_idempotencyKey: { customerId, idempotencyKey: input.idempotencyKey } },
        });
        if (winner) return winner;
      }
      throw err;
    }
  }

  /** Takes stock from the earliest-expiring usable batches. Row locks make concurrent orders queue up. */
  private async allocate(tx: Prisma.TransactionClient, medicineId: string, name: string, orderItemId: string, qty: number) {
    const batches = await tx.$queryRaw<{ id: string; qtyRemaining: number }[]>`
      SELECT id, "qtyRemaining" FROM "Batch"
      WHERE "medicineId" = ${medicineId} AND "qtyRemaining" > 0 AND "expiresAt" >= CURRENT_DATE
      ORDER BY "expiresAt" ASC, id ASC FOR UPDATE`;
    let left = qty;
    for (const b of batches) {
      if (left === 0) break;
      const take = Math.min(left, b.qtyRemaining);
      await tx.batch.update({ where: { id: b.id }, data: { qtyRemaining: { decrement: take } } });
      await tx.orderAllocation.create({ data: { orderItemId, batchId: b.id, qty: take } });
      left -= take;
    }
    if (left > 0) throw conflict('OUT_OF_STOCK', `Sorry, ${name} does not have enough stock`);
  }

  /**
   * Loose pieces, earliest-expiring batch first. A batch's already-opened pieces go before
   * opening another of its packs, so at most one pack per batch is ever left part-used.
   */
  private async allocatePieces(tx: Prisma.TransactionClient, medicineId: string, name: string, orderItemId: string, qty: number, perPack: number) {
    const batches = await tx.$queryRaw<{ id: string; qtyRemaining: number; looseQty: number }[]>`
      SELECT id, "qtyRemaining", "looseQty" FROM "Batch"
      WHERE "medicineId" = ${medicineId} AND ("qtyRemaining" > 0 OR "looseQty" > 0) AND "expiresAt" >= CURRENT_DATE
      ORDER BY "expiresAt" ASC, id ASC FOR UPDATE`;
    let left = qty;
    for (const b of batches) {
      if (left === 0) break;
      const take = Math.min(left, b.looseQty + b.qtyRemaining * perPack);
      const opened = Math.max(0, Math.ceil((take - b.looseQty) / perPack));
      await tx.batch.update({
        where: { id: b.id },
        data: { qtyRemaining: { decrement: opened }, looseQty: b.looseQty + opened * perPack - take },
      });
      await tx.orderAllocation.create({ data: { orderItemId, batchId: b.id, qty: take, loose: true } });
      left -= take;
    }
    if (left > 0) throw conflict('OUT_OF_STOCK', `Sorry, ${name} does not have enough stock`);
  }

  /** The single path for status changes: checks the actor, restocks, writes the ledger, audits, notifies. */
  async transition(
    orderId: string,
    to: OrderStatus,
    actor: OrderActor,
    actorId: string,
    opts: { riderId?: string; note?: string; code?: string } = {},
  ) {
    let previousRider: string | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      if (!locked) throw notFound('Order not found');
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      previousRider = order.riderId;
      if (actor === 'CUSTOMER' && order.customerId !== actorId) throw notFound('Order not found');
      if (actor === 'RIDER' && order.riderId !== actorId) throw notFound('Order not found');
      if (!canTransition(order.status, to, actor)) throw conflict('INVALID_TRANSITION', `An order that is ${order.status.toLowerCase().replaceAll('_', ' ')} cannot be changed to that status`);

      const data: Prisma.OrderUpdateInput = { status: to };
      if (to === 'ASSIGNED') {
        if (!opts.riderId) throw badRequest('RIDER_REQUIRED', 'Choose a delivery person');
        const rider = await tx.user.findFirst({ where: { id: opts.riderId, role: 'RIDER', isActive: true } });
        if (!rider) throw badRequest('RIDER_INVALID', 'That delivery person is not available');
        data.rider = { connect: { id: rider.id } };
      }
      // Proof of delivery: the customer only sees this code in their app, so a rider cannot fake a handover.
      if (to === 'OUT_FOR_DELIVERY') data.handoverCode = handoverCode();
      if (to === 'DELIVERED' && actor === 'RIDER' && order.handoverCode && !safeEqual(order.handoverCode, opts.code ?? '')) {
        throw badRequest('HANDOVER_CODE', 'That code does not match. Ask the customer for the 4-digit code in their app.');
      }
      if (restoresStock(to)) {
        const allocations = await tx.orderAllocation.findMany({ where: { orderItem: { orderId } } });
        // Loose pieces go back as loose: a cut strip cannot become a sealed pack again.
        for (const a of allocations) {
          await tx.batch.update({ where: { id: a.batchId }, data: a.loose ? { looseQty: { increment: a.qty } } : { qtyRemaining: { increment: a.qty } } });
        }
        await tx.orderAllocation.deleteMany({ where: { orderItem: { orderId } } });
      }
      // A bKash order stopped after payment still holds the customer's money, so an admin must refund it.
      if ((to === 'CANCELLED' || to === 'FAILED') && order.paymentStatus === 'PAID') {
        await tx.auditLog.create({ data: { actorId, action: 'payment.needs_refund', entity: 'Order', entityId: orderId } });
      }
      if (to === 'DELIVERED') {
        data.deliveredAt = new Date();
        await tx.riderLedgerEntry.create({ data: { riderId: order.riderId!, orderId, type: 'EARNING', amountPoisha: order.riderPayoutPoisha } });
        if (order.paymentMethod === 'COD') {
          await tx.riderLedgerEntry.create({ data: { riderId: order.riderId!, orderId, type: 'COD_COLLECTED', amountPoisha: order.totalPoisha } });
          data.paymentStatus = 'PAID';
        }
      }
      await tx.orderEvent.create({ data: { orderId, fromStatus: order.status, toStatus: to, actorId, note: opts.note } });
      return tx.order.update({ where: { id: orderId }, data });
    });
    await this.publish(updated.id, updated.status, [updated.riderId, previousRider]);
    return updated;
  }

  /**
   * Live updates are best-effort: a Redis hiccup must not fail a change that is already saved.
   * One message fans out to the order's own channel, the admin board, and every rider it concerns.
   */
  async publish(orderId: string, status: string, riders: (string | null | undefined)[] = []) {
    const msg = JSON.stringify({ orderId, status, at: Date.now() });
    const channels = new Set([orderChannel(orderId), ADMIN_CHANNEL, ...riders.filter(Boolean).map((r) => riderChannel(r!))]);
    await Promise.all([...channels].map((c) => this.redis.publish(c, msg).catch(() => undefined)));
  }
}

function handoverCode() {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
