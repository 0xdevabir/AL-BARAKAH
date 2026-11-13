import { randomBytes } from 'node:crypto';
import { Body, Controller, Delete, Get, Inject, MessageEvent, Module, Param, Patch, Post, Put, Query, Sse } from '@nestjs/common';
import { addressSchema, adminOrderItemsSchema, adminTransitionSchema, placeOrderSchema, riderRespondSchema, prescriptionUploadSchema, rateOrderSchema, riderLocationSchema, riderOnlineSchema, riderTransitionSchema, settleSchema } from '@albarakah/contracts';
import type { OrderStatus, Prisma, PrismaClient } from '@albarakah/database';
import { Redis } from 'ioredis';
import { Observable } from 'rxjs';
import type { z } from 'zod';
import { type AuthUser, badRequest, conflict, CurrentUser, Public, RequirePermission } from '@albarakah/nest-common';
import { notFound, unauthorized, ZodPipe } from '@albarakah/nest-common';
import { PRISMA, REDIS } from '@albarakah/nest-common';
import { ENV, type Env } from '@albarakah/nest-common';
import { SettingsModule, SettingsService } from '../settings/settings.module.js';
import { StorageModule, StorageService } from '../storage/storage.module.js';
import { ADMIN_CHANNEL, orderChannel, OrdersService, riderChannel } from './orders.service.js';

const PAGE = 30;
const ACTIVE: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY'];
/** A rider's "online" flag lapses on its own if their phone dies, so the admin never assigns to a ghost. */
const ONLINE_TTL = 15 * 60;
export const riderOnlineKey = (id: string) => `rider:online:${id}`;
/** Last GPS fix per rider. Short-lived, so a stale dot never shows on a customer's map. */
const LOCATION_TTL = 5 * 60;
const riderLocationKey = (id: string) => `rider:loc:${id}`;
export interface RiderFix { lat: number; lng: number; heading: number | null; speed: number | null; accuracy: number | null; at: string }

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly storage: StorageService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    private readonly settings: SettingsService,
  ) {}

  private async riderFixes(ids: string[]): Promise<(RiderFix | null)[]> {
    if (!ids.length) return [];
    const raw = await this.redis.mget(...ids.map(riderLocationKey));
    return raw.map((r) => {
      try {
        return r ? (JSON.parse(r) as RiderFix) : null;
      } catch {
        return null;
      }
    });
  }

  @Public()
  @Get('delivery-slots')
  slots(@Query('ids') ids?: string) {
    // The cart's medicine ids, so rare medicines push the slots back.
    const medicineIds = (ids ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
    return this.orders.slotsFor(new Date(), medicineIds);
  }

  // ---- addresses ----
  @RequirePermission('address:manage')
  @Get('addresses')
  addresses(@CurrentUser() u: AuthUser) {
    return this.prisma.address.findMany({ where: { userId: u.id, isDeleted: false }, include: { zone: true }, orderBy: { createdAt: 'desc' } });
  }

  @RequirePermission('address:manage')
  @Post('addresses')
  addAddress(@CurrentUser() u: AuthUser, @Body(new ZodPipe(addressSchema)) body: z.output<typeof addressSchema>) {
    return this.prisma.address.create({ data: { ...body, userId: u.id }, include: { zone: true } });
  }

  /** Lets a customer fix the pin or details. Past orders keep their own snapshot. */
  @RequirePermission('address:manage')
  @Put('addresses/:id')
  async updateAddress(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(addressSchema)) body: z.output<typeof addressSchema>) {
    const r = await this.prisma.address.updateMany({
      where: { id, userId: u.id, isDeleted: false },
      data: { ...body, notes: body.notes ?? null, lat: body.lat ?? null, lng: body.lng ?? null },
    });
    if (r.count === 0) throw notFound('Address not found');
    return this.prisma.address.findUniqueOrThrow({ where: { id }, include: { zone: true } });
  }

  @RequirePermission('address:manage')
  @Delete('addresses/:id')
  async removeAddress(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const r = await this.prisma.address.updateMany({ where: { id, userId: u.id }, data: { isDeleted: true } });
    if (r.count === 0) throw notFound('Address not found');
    return { ok: true };
  }

  // ---- customer orders ----
  @RequirePermission('prescription:upload')
  @Post('prescriptions/upload-url')
  uploadUrl(@CurrentUser() u: AuthUser, @Body(new ZodPipe(prescriptionUploadSchema)) body: z.output<typeof prescriptionUploadSchema>) {
    return this.storage.prescriptionUploadUrl(u.id, body.contentType);
  }

  @RequirePermission('order:create')
  @Post('orders')
  place(@CurrentUser() u: AuthUser, @Body(new ZodPipe(placeOrderSchema)) body: z.output<typeof placeOrderSchema>) {
    return this.orders.place(u.id, body);
  }

  @RequirePermission('order:read-own')
  @Get('orders')
  mine(@CurrentUser() u: AuthUser, @Query('page') page?: string, @Query('scope') scope?: string) {
    const where: Prisma.OrderWhereInput = { customerId: u.id };
    if (scope === 'active') where.status = { in: ACTIVE };
    if (scope === 'past') where.status = { notIn: ACTIVE };
    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (Math.max(Number(page) || 1, 1) - 1) * PAGE,
      take: PAGE,
      select: { id: true, code: true, status: true, type: true, totalPoisha: true, promisedBy: true, slotStart: true, slotEnd: true, createdAt: true, paymentMethod: true, paymentStatus: true, addressSnapshot: true, rating: true, items: { select: { nameSnapshot: true, qty: true } } },
    });
  }

  @RequirePermission('order:read-own')
  @Get('orders/:id')
  async mineOne(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const o = await this.prisma.order.findFirst({
      where: { id, customerId: u.id },
      include: { items: { include: { medicine: { select: { slug: true, imageUrl: true } } } }, events: { orderBy: { createdAt: 'asc' } }, rider: { select: { name: true, phone: true } } },
    });
    if (!o) throw notFound('Order not found');
    const { riderPayoutPoisha: _hidden, idempotencyKey: _key, handoverCode, ...rest } = o;
    const onTheWay = o.status === 'OUT_FOR_DELIVERY';
    const riderAccepted = (o.status === 'ASSIGNED' && !!o.riderAcceptedAt) || onTheWay;
    // The rider's name shows once they take the job; phone and handover code only while it is on its way.
    return {
      ...rest,
      riderAccepted,
      rider: onTheWay ? o.rider : riderAccepted && o.rider ? { name: o.rider.name, phone: null } : null,
      handoverCode: onTheWay ? handoverCode : null,
    };
  }

  /** Live map data: polled every few seconds by the order screen. The rider's position is only shared while they are on the way. */
  @RequirePermission('order:read-own')
  @Get('orders/:id/track')
  async track(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const o = await this.prisma.order.findFirst({ where: { id, customerId: u.id }, select: { status: true, riderId: true, riderAcceptedAt: true, addressSnapshot: true, promisedBy: true } });
    if (!o) throw notFound('Order not found');
    const s = await this.settings.get();
    const snap = o.addressSnapshot as { lat?: number | null; lng?: number | null };
    // Shared from the moment the rider accepts the job, so the customer sees them heading to the pharmacy too.
    const sharing = !!o.riderId && (o.status === 'OUT_FOR_DELIVERY' || (o.status === 'ASSIGNED' && !!o.riderAcceptedAt));
    const [fix] = sharing ? await this.riderFixes([o.riderId!]) : [null];
    return {
      status: o.status,
      riderAccepted: sharing,
      promisedBy: o.promisedBy,
      pharmacy: { lat: s.pharmacyLat, lng: s.pharmacyLng },
      destination: typeof snap.lat === 'number' && typeof snap.lng === 'number' ? { lat: snap.lat, lng: snap.lng } : null,
      rider: fix ?? null,
    };
  }

  @RequirePermission('order:read-own')
  @Post('orders/:id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.orders.transition(id, 'CANCELLED', 'CUSTOMER', u.id);
  }

  @RequirePermission('order:read-own')
  @Post('orders/:id/rate')
  async rate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(rateOrderSchema)) body: z.output<typeof rateOrderSchema>) {
    const r = await this.prisma.order.updateMany({
      where: { id, customerId: u.id, status: 'DELIVERED', rating: null },
      data: { rating: body.rating, feedback: body.feedback },
    });
    if (r.count === 0) throw conflict('CANNOT_RATE', 'Only a delivered order can be rated, and only once');
    return { ok: true };
  }

  /** What can be put straight back into the cart: active medicines at today's price. */
  @RequirePermission('order:read-own')
  @Get('orders/:id/reorder')
  async reorder(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const o = await this.prisma.order.findFirst({ where: { id, customerId: u.id }, select: { items: { select: { medicineId: true, qty: true, unit: true } } } });
    if (!o) throw notFound('Order not found');
    const meds = await this.prisma.medicine.findMany({
      where: { id: { in: o.items.map((i) => i.medicineId) }, isActive: true },
      select: { id: true, slug: true, name: true, strength: true, form: true, packSize: true, pricePoisha: true, isRx: true, imageUrl: true },
    });
    const byId = new Map(meds.map((m) => [m.id, m]));
    return {
      items: o.items.flatMap((i) => (byId.has(i.medicineId) ? [{ medicine: byId.get(i.medicineId)!, qty: i.qty, unit: i.unit }] : [])),
      unavailable: o.items.length - o.items.filter((i) => byId.has(i.medicineId)).length,
    };
  }

  /** Browsers cannot set headers on EventSource, so a 60-second one-use ticket keeps tokens out of URLs. */
  @RequirePermission('order:read-own')
  @Post('orders/:id/events/ticket')
  async ticket(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const owned = await this.prisma.order.count({ where: { id, customerId: u.id } });
    if (!owned) throw notFound('Order not found');
    return this.issueTicket(orderChannel(id));
  }

  @RequirePermission('order:manage')
  @Post('admin/orders/events/ticket')
  adminTicket() {
    return this.issueTicket(ADMIN_CHANNEL);
  }

  @RequirePermission('delivery:work')
  @Post('delivery/events/ticket')
  riderTicket(@CurrentUser() u: AuthUser) {
    return this.issueTicket(riderChannel(u.id));
  }

  private async issueTicket(channel: string) {
    const ticket = randomBytes(24).toString('base64url');
    await this.redis.set(`sse:${ticket}`, channel, 'EX', 60);
    return { ticket };
  }

  @Public()
  @Sse('orders/events/stream')
  async stream(@Query('ticket') ticket?: string): Promise<Observable<MessageEvent>> {
    const stored = ticket ? await this.redis.getdel(`sse:${ticket}`) : null;
    if (!stored) throw unauthorized('Invalid or expired ticket');
    // Tickets issued before channels were stored held a bare order id.
    const channel = stored.includes(':') ? stored : orderChannel(stored);
    return new Observable<MessageEvent>((sub) => {
      // Subscribing needs its own connection, and works across every API instance.
      const listener = new Redis(this.env.REDIS_URL);
      void listener.subscribe(channel);
      listener.on('message', (_c, msg) => sub.next({ data: msg }));
      const beat = setInterval(() => sub.next({ type: 'ping', data: '' }), 25_000);
      return () => {
        clearInterval(beat);
        listener.disconnect();
      };
    });
  }

  // ---- admin ----
  @RequirePermission('order:manage')
  @Get('admin/orders')
  adminList(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('late') late?: string,
  ) {
    const where: Prisma.OrderWhereInput = {};
    if (status === 'ACTIVE') where.status = { in: ACTIVE };
    else if (status) where.status = status as OrderStatus;
    if (type === 'EMERGENCY' || type === 'NORMAL') where.type = type;
    if (late === '1') {
      where.status = { in: ACTIVE };
      where.promisedBy = { lt: new Date() };
    }
    const term = q?.trim();
    if (term) {
      where.OR = [
        { code: { contains: term.toUpperCase() } },
        { customer: { phone: { contains: term.replace(/\s/g, '') } } },
        { customer: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.order.findMany({
      where,
      orderBy: [{ promisedBy: 'asc' }],
      skip: (Math.max(Number(page) || 1, 1) - 1) * PAGE,
      take: PAGE,
      include: {
        items: true, customer: { select: { name: true, phone: true } }, rider: { select: { id: true, name: true } },
        payments: { where: { status: 'PAID' }, select: { id: true } },
      },
    });
  }

  @RequirePermission('order:manage')
  @Get('admin/orders/counts')
  async adminCounts() {
    const [groups, late] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: { OR: [{ status: { in: ACTIVE } }, { updatedAt: { gte: startOfDay() } }] }, _count: true }),
      this.prisma.order.count({ where: { status: { in: ACTIVE }, promisedBy: { lt: new Date() } } }),
    ]);
    const counts: Record<string, number> = Object.fromEntries(groups.map((g) => [g.status, g._count]));
    return { counts, late, active: ACTIVE.reduce((n, s) => n + (counts[s] ?? 0), 0) };
  }

  @RequirePermission('order:manage')
  @Get('admin/orders/:id')
  async adminOne(@Param('id') id: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { allocations: { include: { batch: { select: { batchNo: true, expiresAt: true } } } } } },
        events: { orderBy: { createdAt: 'asc' } },
        customer: { select: { id: true, name: true, phone: true, createdAt: true, _count: { select: { orders: true } } } },
        rider: { select: { id: true, name: true, phone: true } },
        payments: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, amountPoisha: true, trxId: true, createdAt: true } },
        // The e-prescription that authorised the Rx medicines, so the pharmacist can check it before packing.
        consultation: {
          select: { id: true, code: true, startsAt: true, prescribedAt: true, prescription: true, doctor: { select: { bmdcNo: true, specialty: true, user: { select: { name: true } } } } },
        },
      },
    });
    if (!o) throw notFound('Order not found');
    const actorIds = [...new Set(o.events.map((e) => e.actorId).filter(Boolean))] as string[];
    const actors = await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, role: true } });
    const { idempotencyKey: _key, ...rest } = o;
    return { ...rest, actors };
  }

  @RequirePermission('order:manage')
  @Patch('admin/orders/:id/status')
  adminTransition(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(adminTransitionSchema)) body: z.output<typeof adminTransitionSchema>) {
    return this.orders.transition(id, body.to, 'ADMIN', u.id, { riderId: body.riderId, note: body.note });
  }

  /** Fill a prescription-only order (or correct one) while it is still PLACED. */
  @RequirePermission('order:manage')
  @Put('admin/orders/:id/items')
  setItems(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(adminOrderItemsSchema)) body: z.output<typeof adminOrderItemsSchema>) {
    return this.orders.setItems(id, body.items, u.id, body.note);
  }

  /** Every delivery in progress with its rider's last fix, for the live map. */
  @RequirePermission('order:manage')
  @Get('admin/deliveries/live')
  async liveDeliveries() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ['ASSIGNED', 'OUT_FOR_DELIVERY'] } },
      orderBy: { promisedBy: 'asc' },
      take: 200,
      select: {
        id: true, code: true, status: true, type: true, promisedBy: true, riderAcceptedAt: true, addressSnapshot: true,
        rider: { select: { id: true, name: true, phone: true } },
      },
    });
    const riderIds = [...new Set(orders.map((o) => o.rider?.id).filter(Boolean))] as string[];
    const [s, fixes] = await Promise.all([this.settings.get(), this.riderFixes(riderIds)]);
    const fixById = new Map(riderIds.map((id, i) => [id, fixes[i] ?? null]));
    const now = Date.now();
    return {
      pharmacy: { lat: s.pharmacyLat, lng: s.pharmacyLng },
      orders: orders.map((o) => {
        const snap = o.addressSnapshot as { lat?: number | null; lng?: number | null; zone?: string; line?: string };
        return {
          id: o.id, code: o.code, status: o.status, type: o.type, promisedBy: o.promisedBy, late: o.promisedBy.getTime() < now,
          riderAccepted: !!o.riderAcceptedAt, rider: o.rider,
          destination: typeof snap.lat === 'number' && typeof snap.lng === 'number' ? { lat: snap.lat, lng: snap.lng } : null,
          area: snap.zone ?? '', line: snap.line ?? '',
          location: o.rider ? fixById.get(o.rider.id) ?? null : null,
        };
      }),
    };
  }

  @RequirePermission('prescription:read')
  @Get('admin/orders/:id/prescription')
  async prescription(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const o = await this.prisma.order.findUnique({ where: { id }, select: { prescriptionKey: true } });
    if (!o?.prescriptionKey) throw notFound('No prescription on this order');
    // Health data: every view is recorded.
    await this.prisma.auditLog.create({ data: { actorId: u.id, action: 'prescription.view', entity: 'Order', entityId: id } });
    return { url: await this.storage.signedReadUrl(o.prescriptionKey) };
  }

  /** Riders for the assign sheet, with their live load and whether they are on shift. */
  @RequirePermission('order:manage')
  @Get('admin/riders')
  async riders() {
    const riders = await this.prisma.user.findMany({
      where: { role: 'RIDER', isActive: true },
      select: { id: true, name: true, phone: true, _count: { select: { deliveries: { where: { status: { in: ['ASSIGNED', 'OUT_FOR_DELIVERY'] } } } } } },
      orderBy: { name: 'asc' },
    });
    const [online, fixes] = await Promise.all([
      riders.length ? this.redis.mget(...riders.map((r) => riderOnlineKey(r.id))) : [],
      this.riderFixes(riders.map((r) => r.id)),
    ]);
    return riders
      .map((r, i) => ({ id: r.id, name: r.name, phone: r.phone, activeJobs: r._count.deliveries, online: !!online[i], location: fixes[i] ?? null }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.activeJobs - b.activeJobs);
  }

  // ---- rider: only ever their own jobs, and never prescriptions ----
  @RequirePermission('delivery:work')
  @Get('delivery/jobs')
  jobs(@CurrentUser() u: AuthUser) {
    return this.prisma.order.findMany({
      where: { riderId: u.id, status: { in: ['ASSIGNED', 'OUT_FOR_DELIVERY'] } },
      orderBy: [{ type: 'desc' }, { promisedBy: 'asc' }],
      select: {
        id: true, code: true, status: true, type: true, promisedBy: true, slotStart: true, slotEnd: true, addressSnapshot: true,
        totalPoisha: true, paymentMethod: true, paymentStatus: true, riderPayoutPoisha: true, notes: true, updatedAt: true, riderAcceptedAt: true,
        customer: { select: { name: true } }, items: { select: { nameSnapshot: true, qty: true } },
      },
    });
  }

  /** Take an assigned job, or hand it back with a reason so the pharmacy can reassign it. */
  @RequirePermission('delivery:work')
  @Post('delivery/jobs/:id/respond')
  respond(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(riderRespondSchema)) body: z.output<typeof riderRespondSchema>) {
    return this.orders.riderRespond(id, u.id, body.accept, body.reason);
  }

  @RequirePermission('delivery:work')
  @Get('delivery/history')
  history(@CurrentUser() u: AuthUser, @Query('page') page?: string) {
    return this.prisma.order.findMany({
      where: { riderId: u.id, status: { in: ['DELIVERED', 'FAILED'] } },
      orderBy: { updatedAt: 'desc' },
      skip: (Math.max(Number(page) || 1, 1) - 1) * PAGE,
      take: PAGE,
      select: {
        id: true, code: true, status: true, type: true, promisedBy: true, deliveredAt: true, updatedAt: true, addressSnapshot: true,
        totalPoisha: true, paymentMethod: true, riderPayoutPoisha: true, rating: true,
      },
    });
  }

  @RequirePermission('delivery:work')
  @Get('delivery/summary')
  async summary(@CurrentUser() u: AuthUser) {
    const today = startOfDay();
    const weekAgo = new Date(today.getTime() - 6 * 86_400_000);
    const [active, deliveredToday, failedToday, earnedToday, week, ledger, online, ratings, onTime] = await Promise.all([
      this.prisma.order.count({ where: { riderId: u.id, status: { in: ['ASSIGNED', 'OUT_FOR_DELIVERY'] } } }),
      this.prisma.order.count({ where: { riderId: u.id, status: 'DELIVERED', deliveredAt: { gte: today } } }),
      this.prisma.order.count({ where: { riderId: u.id, status: 'FAILED', updatedAt: { gte: today } } }),
      this.prisma.riderLedgerEntry.aggregate({ where: { riderId: u.id, type: 'EARNING', createdAt: { gte: today } }, _sum: { amountPoisha: true } }),
      this.prisma.riderLedgerEntry.findMany({ where: { riderId: u.id, type: 'EARNING', createdAt: { gte: weekAgo } }, select: { amountPoisha: true, createdAt: true } }),
      this.ledgerTotals(u.id),
      this.redis.get(riderOnlineKey(u.id)),
      this.prisma.order.aggregate({ where: { riderId: u.id, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
      this.prisma.$queryRaw<{ total: bigint; ontime: bigint }[]>`
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE "deliveredAt" <= "promisedBy") AS ontime
        FROM "Order" WHERE "riderId" = ${u.id} AND status = 'DELIVERED' AND "deliveredAt" IS NOT NULL`,
    ]);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekAgo.getTime() + i * 86_400_000);
      const next = d.getTime() + 86_400_000;
      return { date: d.toISOString(), poisha: week.filter((e) => e.createdAt.getTime() >= d.getTime() && e.createdAt.getTime() < next).reduce((s, e) => s + e.amountPoisha, 0) };
    });
    const total = Number(onTime[0]?.total ?? 0);
    return {
      online: !!online, active, deliveredToday, failedToday,
      earnedTodayPoisha: earnedToday._sum.amountPoisha ?? 0,
      week: days,
      cashHeldPoisha: ledger.cashHeldPoisha,
      rating: ratings._avg.rating, ratingCount: ratings._count.rating,
      onTimeRate: total ? Number(onTime[0]!.ontime) / total : null,
    };
  }

  @RequirePermission('delivery:work')
  @Put('delivery/online')
  async setOnline(@CurrentUser() u: AuthUser, @Body(new ZodPipe(riderOnlineSchema)) body: z.output<typeof riderOnlineSchema>) {
    if (body.online) await this.redis.set(riderOnlineKey(u.id), '1', 'EX', ONLINE_TTL);
    else await this.redis.del([riderOnlineKey(u.id), riderLocationKey(u.id)]);
    return { online: body.online };
  }

  /** GPS fix from the rider app. Only accepted on shift, and it doubles as the shift heartbeat. */
  @RequirePermission('delivery:work')
  @Put('delivery/location')
  async setLocation(@CurrentUser() u: AuthUser, @Body(new ZodPipe(riderLocationSchema)) body: z.output<typeof riderLocationSchema>) {
    const online = await this.redis.get(riderOnlineKey(u.id));
    if (!online) return { ok: false, online: false };
    const fix: RiderFix = { lat: body.lat, lng: body.lng, heading: body.heading ?? null, speed: body.speed ?? null, accuracy: body.accuracy ?? null, at: new Date().toISOString() };
    await this.redis.multi().set(riderLocationKey(u.id), JSON.stringify(fix), 'EX', LOCATION_TTL).expire(riderOnlineKey(u.id), ONLINE_TTL).exec();
    return { ok: true, online: true };
  }

  @RequirePermission('delivery:work')
  @Get('delivery/pickup')
  async pickup() {
    const s = await this.settings.get();
    return { lat: s.pharmacyLat, lng: s.pharmacyLng, address: s.pharmacyAddress };
  }

  @RequirePermission('delivery:work')
  @Patch('delivery/jobs/:id/status')
  riderTransition(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(riderTransitionSchema)) body: z.output<typeof riderTransitionSchema>) {
    if (body.to === 'FAILED' && !body.note) throw badRequest('REASON_REQUIRED', 'Say why the delivery failed');
    return this.orders.transition(id, body.to, 'RIDER', u.id, { note: body.note, code: body.code });
  }

  @RequirePermission('delivery:work')
  @Get('delivery/ledger')
  riderLedger(@CurrentUser() u: AuthUser) {
    return this.ledgerFor(u.id);
  }

  private async ledgerTotals(riderId: string) {
    const groups = await this.prisma.riderLedgerEntry.groupBy({ by: ['type'], where: { riderId }, _sum: { amountPoisha: true } });
    const sum = (t: string) => groups.find((g) => g.type === t)?._sum.amountPoisha ?? 0;
    return { earnedPoisha: sum('EARNING'), codCollectedPoisha: sum('COD_COLLECTED'), settledPoisha: sum('SETTLEMENT'), cashHeldPoisha: sum('COD_COLLECTED') - sum('SETTLEMENT') };
  }

  private async ledgerFor(riderId: string) {
    const [totals, entries] = await Promise.all([
      this.ledgerTotals(riderId),
      this.prisma.riderLedgerEntry.findMany({ where: { riderId }, orderBy: { createdAt: 'desc' }, take: 50, include: { order: { select: { code: true } } } }),
    ]);
    return { ...totals, entries };
  }

  @RequirePermission('ledger:manage')
  @Get('admin/riders/:id/ledger')
  adminLedger(@Param('id') id: string) {
    return this.ledgerFor(id);
  }

  @RequirePermission('ledger:manage')
  @Post('admin/riders/:id/settle')
  async settle(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(settleSchema)) body: z.output<typeof settleSchema>) {
    const { cashHeldPoisha } = await this.ledgerTotals(id);
    if (body.amountPoisha > cashHeldPoisha) throw badRequest('OVER_SETTLE', 'That is more than the cash this rider is holding');
    const entry = await this.prisma.riderLedgerEntry.create({ data: { riderId: id, type: 'SETTLEMENT', amountPoisha: body.amountPoisha, note: body.note } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, action: 'rider.settle', entity: 'User', entityId: id, data: { amountPoisha: body.amountPoisha } } });
    return entry;
  }
}

@Module({ imports: [SettingsModule, StorageModule], controllers: [OrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}
