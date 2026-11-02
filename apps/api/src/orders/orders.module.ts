import { randomBytes } from 'node:crypto';
import { Body, Controller, Delete, Get, Inject, MessageEvent, Module, Param, Patch, Post, Query, Sse } from '@nestjs/common';
import { addressSchema, adminTransitionSchema, placeOrderSchema, prescriptionUploadSchema, riderTransitionSchema, settleSchema } from '@albarakah/contracts';
import type { OrderStatus, PrismaClient } from '@albarakah/database';
import { Redis } from 'ioredis';
import { Observable } from 'rxjs';
import type { z } from 'zod';
import { type AuthUser, CurrentUser, Public, RequirePermission } from '../common/auth.js';
import { notFound, unauthorized, ZodPipe } from '../common/errors.js';
import { PRISMA, REDIS } from '../common/infra.module.js';
import { ENV, type Env } from '../config/env.js';
import { SettingsModule } from '../settings/settings.module.js';
import { StorageModule, StorageService } from '../storage/storage.module.js';
import { orderChannel, OrdersService } from './orders.service.js';

const PAGE = 30;

@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly storage: StorageService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Get('delivery-slots')
  slots() {
    return this.orders.slotsFor();
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
  mine(@CurrentUser() u: AuthUser, @Query('page') page?: string) {
    return this.prisma.order.findMany({
      where: { customerId: u.id },
      orderBy: { createdAt: 'desc' },
      skip: (Math.max(Number(page) || 1, 1) - 1) * PAGE,
      take: PAGE,
      select: { id: true, code: true, status: true, type: true, totalPoisha: true, promisedBy: true, slotStart: true, slotEnd: true, createdAt: true, paymentMethod: true, paymentStatus: true, items: { select: { nameSnapshot: true, qty: true } } },
    });
  }

  @RequirePermission('order:read-own')
  @Get('orders/:id')
  async mineOne(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const o = await this.prisma.order.findFirst({
      where: { id, customerId: u.id },
      include: { items: true, events: { orderBy: { createdAt: 'asc' } }, rider: { select: { name: true, phone: true } } },
    });
    if (!o) throw notFound('Order not found');
    const { riderPayoutPoisha: _hidden, idempotencyKey: _key, ...rest } = o;
    // The rider's phone is only useful, and only shared, while the order is on its way.
    return { ...rest, rider: o.status === 'OUT_FOR_DELIVERY' ? o.rider : null };
  }

  @RequirePermission('order:read-own')
  @Post('orders/:id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.orders.transition(id, 'CANCELLED', 'CUSTOMER', u.id);
  }

  /** Browsers cannot set headers on EventSource, so a 60-second one-use ticket keeps tokens out of URLs. */
  @RequirePermission('order:read-own')
  @Post('orders/:id/events/ticket')
  async ticket(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const owned = await this.prisma.order.count({ where: { id, customerId: u.id } });
    if (!owned) throw notFound('Order not found');
    const ticket = randomBytes(24).toString('base64url');
    await this.redis.set(`sse:${ticket}`, id, 'EX', 60);
    return { ticket };
  }

  @Public()
  @Sse('orders/events/stream')
  async stream(@Query('ticket') ticket?: string): Promise<Observable<MessageEvent>> {
    const orderId = ticket ? await this.redis.getdel(`sse:${ticket}`) : null;
    if (!orderId) throw unauthorized('Invalid or expired ticket');
    return new Observable<MessageEvent>((sub) => {
      // Subscribing needs its own connection, and works across every API instance.
      const listener = new Redis(this.env.REDIS_URL);
      void listener.subscribe(orderChannel(orderId));
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
  adminList(@Query('status') status?: string, @Query('page') page?: string) {
    return this.prisma.order.findMany({
      where: status ? { status: status as OrderStatus } : {},
      orderBy: [{ promisedBy: 'asc' }],
      skip: (Math.max(Number(page) || 1, 1) - 1) * PAGE,
      take: PAGE,
      include: { items: true, customer: { select: { name: true, phone: true } }, rider: { select: { id: true, name: true } } },
    });
  }

  @RequirePermission('order:manage')
  @Patch('admin/orders/:id/status')
  adminTransition(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(adminTransitionSchema)) body: z.output<typeof adminTransitionSchema>) {
    return this.orders.transition(id, body.to, 'ADMIN', u.id, { riderId: body.riderId, note: body.note });
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

  // ---- rider: only ever their own jobs, and never prescriptions ----
  @RequirePermission('delivery:work')
  @Get('delivery/jobs')
  jobs(@CurrentUser() u: AuthUser) {
    return this.prisma.order.findMany({
      where: { riderId: u.id, status: { in: ['ASSIGNED', 'OUT_FOR_DELIVERY'] } },
      orderBy: { promisedBy: 'asc' },
      select: {
        id: true, code: true, status: true, type: true, promisedBy: true, slotStart: true, slotEnd: true, addressSnapshot: true,
        totalPoisha: true, paymentMethod: true, paymentStatus: true, riderPayoutPoisha: true, notes: true,
        customer: { select: { name: true } }, items: { select: { nameSnapshot: true, qty: true } },
      },
    });
  }

  @RequirePermission('delivery:work')
  @Patch('delivery/jobs/:id/status')
  riderTransition(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(riderTransitionSchema)) body: z.output<typeof riderTransitionSchema>) {
    return this.orders.transition(id, body.to, 'RIDER', u.id, { note: body.note });
  }

  @RequirePermission('delivery:work')
  @Get('delivery/ledger')
  riderLedger(@CurrentUser() u: AuthUser) {
    return this.ledgerFor(u.id);
  }

  private async ledgerFor(riderId: string) {
    const groups = await this.prisma.riderLedgerEntry.groupBy({ by: ['type'], where: { riderId }, _sum: { amountPoisha: true } });
    const sum = (t: string) => groups.find((g) => g.type === t)?._sum.amountPoisha ?? 0;
    const entries = await this.prisma.riderLedgerEntry.findMany({ where: { riderId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { earnedPoisha: sum('EARNING'), codCollectedPoisha: sum('COD_COLLECTED'), settledPoisha: sum('SETTLEMENT'), cashHeldPoisha: sum('COD_COLLECTED') - sum('SETTLEMENT'), entries };
  }

  @RequirePermission('ledger:manage')
  @Get('admin/riders/:id/ledger')
  adminLedger(@Param('id') id: string) {
    return this.ledgerFor(id);
  }

  @RequirePermission('ledger:manage')
  @Post('admin/riders/:id/settle')
  async settle(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(settleSchema)) body: z.output<typeof settleSchema>) {
    const entry = await this.prisma.riderLedgerEntry.create({ data: { riderId: id, type: 'SETTLEMENT', amountPoisha: body.amountPoisha, note: body.note } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, action: 'rider.settle', entity: 'User', entityId: id, data: { amountPoisha: body.amountPoisha } } });
    return entry;
  }
}

@Module({ imports: [SettingsModule, StorageModule], controllers: [OrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}
