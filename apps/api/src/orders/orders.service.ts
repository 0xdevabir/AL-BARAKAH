import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { placeOrderSchema } from '@albarakah/contracts';
import type { OrderStatus, Prisma, PrismaClient } from '@albarakah/database';
import { canTransition, computeTotals, deliverySlots, emergencyDeadline, isEmergencyAvailable, isValidDeliverySlot, type OrderActor, restoresStock } from '@albarakah/domain';
import type { Redis } from 'ioredis';
import type { z } from 'zod';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { PRISMA, REDIS } from '../common/infra.module.js';
import { SettingsService } from '../settings/settings.module.js';

export const orderChannel = (orderId: string) => `order:${orderId}`;
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
    const qtyById = new Map<string, number>();
    for (const i of input.items) qtyById.set(i.medicineId, (qtyById.get(i.medicineId) ?? 0) + i.qty);
    const ids = [...qtyById.keys()].sort();
    const medicines = await this.prisma.medicine.findMany({ where: { id: { in: ids }, isActive: true } });
    if (medicines.length !== ids.length) throw badRequest('ITEM_UNAVAILABLE', 'An item in your cart is no longer available');
    if (s.requireRxUpload && medicines.some((m) => m.isRx) && !input.prescriptionKey) {
      throw badRequest('PRESCRIPTION_REQUIRED', 'Please upload a prescription for the prescription medicines in your cart');
    }
    if (input.prescriptionKey && !input.prescriptionKey.startsWith(`rx/${customerId}/`)) throw forbidden();

    const byId = new Map(medicines.map((m) => [m.id, m]));
    const lines = ids.map((id) => ({ medicine: byId.get(id)!, qty: qtyById.get(id)! }));
    const totals = computeTotals({
      lines: lines.map((l) => ({ unitPricePoisha: l.medicine.pricePoisha, qty: l.qty })),
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
            addressSnapshot: { label: address.label, line: address.line, phone: address.phone, notes: address.notes, zone: address.zone.name },
            ...totals,
            paymentMethod: input.paymentMethod,
            paymentStatus: input.paymentMethod === 'BKASH' ? 'PENDING' : 'UNPAID',
            prescriptionKey: input.prescriptionKey,
            notes: input.notes,
            idempotencyKey: input.idempotencyKey,
            events: { create: { toStatus: 'PLACED', actorId: customerId } },
          },
        });
        for (const { medicine, qty } of lines) {
          const item = await tx.orderItem.create({
            data: { orderId: order.id, medicineId: medicine.id, nameSnapshot: `${medicine.name} ${medicine.strength}`.trim(), unitPricePoisha: medicine.pricePoisha, qty },
          });
          await this.allocate(tx, medicine.id, medicine.name, item.id, qty);
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

  /** The single path for status changes: checks the actor, restocks, writes the ledger, audits, notifies. */
  async transition(orderId: string, to: OrderStatus, actor: OrderActor, actorId: string, opts: { riderId?: string; note?: string } = {}) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      if (!locked) throw notFound('Order not found');
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
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
      if (restoresStock(to)) {
        const allocations = await tx.orderAllocation.findMany({ where: { orderItem: { orderId } } });
        for (const a of allocations) await tx.batch.update({ where: { id: a.batchId }, data: { qtyRemaining: { increment: a.qty } } });
        await tx.orderAllocation.deleteMany({ where: { orderItem: { orderId } } });
      }
      if (to === 'DELIVERED') {
        await tx.riderLedgerEntry.create({ data: { riderId: order.riderId!, orderId, type: 'EARNING', amountPoisha: order.riderPayoutPoisha } });
        if (order.paymentMethod === 'COD') {
          await tx.riderLedgerEntry.create({ data: { riderId: order.riderId!, orderId, type: 'COD_COLLECTED', amountPoisha: order.totalPoisha } });
          data.paymentStatus = 'PAID';
        }
      }
      await tx.orderEvent.create({ data: { orderId, fromStatus: order.status, toStatus: to, actorId, note: opts.note } });
      return tx.order.update({ where: { id: orderId }, data });
    });
    await this.publish(updated.id, updated.status);
    return updated;
  }

  /** Live updates are best-effort: a Redis hiccup must not fail a change that is already saved. */
  async publish(orderId: string, status: string) {
    await this.redis.publish(orderChannel(orderId), JSON.stringify({ orderId, status, at: Date.now() })).catch(() => undefined);
  }
}
