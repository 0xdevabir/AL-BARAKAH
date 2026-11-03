import { Body, Controller, Get, Header, Headers, Inject, Injectable, Logger, Module, Param, Post, Query, Res } from '@nestjs/common';
import { paymentStartSchema } from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { type AuthUser, CurrentUser, Public, RequirePermission } from '../common/auth.js';
import { badRequest, conflict, notFound, ZodPipe } from '../common/errors.js';
import { PRISMA } from '../common/infra.module.js';
import { ENV, type Env } from '../config/env.js';
import { BkashProvider, FakeBkashProvider, type PaymentProvider } from './bkash.provider.js';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

@Injectable()
export class PaymentsService {
  private readonly log = new Logger('Payments');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async start(userId: string, phone: string, purpose: 'ORDER' | 'CONSULTATION', refId: string, native = false) {
    let amountPoisha: number;
    let invoice: string;
    if (purpose === 'ORDER') {
      const o = await this.prisma.order.findFirst({ where: { id: refId, customerId: userId } });
      if (!o) throw notFound('Order not found');
      if (o.paymentMethod !== 'BKASH') throw badRequest('NOT_BKASH', 'This order is cash on delivery');
      if (o.paymentStatus === 'PAID') throw conflict('ALREADY_PAID', 'This order is already paid');
      if (o.status === 'CANCELLED') throw conflict('ORDER_CANCELLED', 'This order was cancelled');
      amountPoisha = o.totalPoisha;
      invoice = o.code;
    } else {
      const c = await this.prisma.consultation.findFirst({ where: { id: refId, customerId: userId } });
      if (!c) throw notFound('Booking not found');
      if (c.status !== 'HOLD') throw conflict('BOOKING_NOT_PAYABLE', 'This booking cannot be paid');
      if (c.holdExpiresAt && c.holdExpiresAt < new Date()) throw conflict('HOLD_EXPIRED', 'Your slot hold expired. Please book again.');
      amountPoisha = c.feePoisha;
      invoice = c.code;
    }
    const payment = await this.prisma.payment.create({
      data: { purpose, userId, amountPoisha, orderId: purpose === 'ORDER' ? refId : null, consultationId: purpose === 'CONSULTATION' ? refId : null },
    });
    const created = await this.provider.create({
      amountPoisha, invoice, payerRef: phone.slice(-11), callbackUrl: `${this.env.PUBLIC_API_BASE}/payments/bkash/${native ? 'app-callback' : 'callback'}`,
    });
    await this.prisma.payment.update({ where: { id: payment.id }, data: { providerPaymentId: created.providerPaymentId } });
    return { paymentId: payment.id, redirectUrl: created.redirectUrl };
  }

  /** bKash's callback is unauthenticated, so its claims are never trusted: execute asks bKash directly. */
  async handleCallback(providerPaymentId: string, status: string): Promise<{ paid: boolean; purpose?: string; refId?: string | null }> {
    const payment = await this.prisma.payment.findUnique({ where: { providerPaymentId } });
    if (!payment) return { paid: false };
    const refId = payment.orderId ?? payment.consultationId;
    if (payment.status === 'PAID') return { paid: true, purpose: payment.purpose, refId };
    if (status !== 'success') {
      await this.markFailed(payment.id);
      return { paid: false, purpose: payment.purpose, refId };
    }
    const result = await this.provider.execute(providerPaymentId);
    if (!result.paid || !result.trxId) {
      this.log.warn(`Payment ${payment.id} not completed: ${result.message}`);
      await this.markFailed(payment.id);
      return { paid: false, purpose: payment.purpose, refId };
    }
    await this.settle(payment.id, result.trxId);
    return { paid: true, purpose: payment.purpose, refId };
  }

  private markFailed(id: string) {
    return this.prisma.payment.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'FAILED' } });
  }

  /** Applies a payment exactly once, however many callbacks or reconciliation runs report it. */
  async settle(paymentId: string, trxId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({ where: { id: paymentId, status: { not: 'PAID' } }, data: { status: 'PAID', trxId } });
      if (claimed.count === 0) return;
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (p.orderId) {
        const o = await tx.order.update({ where: { id: p.orderId }, data: { paymentStatus: 'PAID' } });
        if (o.status === 'CANCELLED' || o.status === 'FAILED') {
          await tx.auditLog.create({ data: { action: 'payment.needs_refund', entity: 'Payment', entityId: p.id, data: { orderId: o.id } } });
        }
      }
      if (p.consultationId) {
        await tx.consultation.updateMany({ where: { id: p.consultationId, status: 'HOLD' }, data: { status: 'CONFIRMED', holdExpiresAt: null } });
        const c = await tx.consultation.findUniqueOrThrow({ where: { id: p.consultationId } });
        // The hold lapsed and the slot may be gone: flag it so an admin refunds rather than losing the money.
        if (c.status !== 'CONFIRMED') {
          await tx.auditLog.create({ data: { action: 'payment.needs_refund', entity: 'Payment', entityId: p.id, data: { consultationId: c.id } } });
        }
      }
    });
  }

  /** Worker job: recovers payments where the customer closed the app before the callback. */
  async reconcile() {
    const cutoff = new Date(Date.now() - 5 * 60_000);
    const floor = new Date(Date.now() - 24 * 3_600_000);
    const pending = await this.prisma.payment.findMany({
      where: { status: 'PENDING', providerPaymentId: { not: null }, createdAt: { lt: cutoff, gt: floor } }, take: 100,
    });
    for (const p of pending) {
      if (this.env.BKASH_MODE === 'fake') continue;
      try {
        const r = await this.provider.query(p.providerPaymentId!);
        if (r.paid && r.trxId) await this.settle(p.id, r.trxId);
      } catch (err) {
        this.log.warn(`Reconcile ${p.id} failed: ${err}`);
      }
    }
  }

  async refund(paymentId: string, actorId: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw notFound('Payment not found');
    if (p.status !== 'PAID' || !p.trxId) throw conflict('NOT_REFUNDABLE', 'Only a completed payment can be refunded');
    // Claim first: if bKash then fails, an admin can see and retry it, and a double click cannot refund twice.
    const claimed = await this.prisma.payment.updateMany({ where: { id: p.id, status: 'PAID' }, data: { status: 'REFUNDED' } });
    if (claimed.count === 0) throw conflict('NOT_REFUNDABLE', 'This payment was already refunded');
    try {
      const r = await this.provider.refund({ providerPaymentId: p.providerPaymentId!, trxId: p.trxId, amountPoisha: p.amountPoisha, invoice: p.id });
      await this.prisma.$transaction(async (tx) => {
        if (p.consultationId) await tx.consultation.update({ where: { id: p.consultationId }, data: { status: 'REFUNDED' } });
        if (p.orderId) await tx.order.update({ where: { id: p.orderId }, data: { paymentStatus: 'REFUNDED' } });
        await tx.auditLog.create({ data: { actorId, action: 'payment.refund', entity: 'Payment', entityId: p.id, data: { refundTrxId: r.refundTrxId, amountPoisha: p.amountPoisha } } });
      });
      return { ok: true, refundTrxId: r.refundTrxId };
    } catch (err) {
      await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'PAID' } });
      this.log.error(`Refund failed for ${p.id}: ${err}`);
      throw badRequest('REFUND_FAILED', 'bKash could not process the refund. Please try again.');
    }
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, @Inject(ENV) private readonly env: Env, @Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @RequirePermission('payment:create')
  @Post('start')
  async start(@CurrentUser() u: AuthUser, @Body(new ZodPipe(paymentStartSchema)) body: z.output<typeof paymentStartSchema>, @Headers('x-client') client?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    return this.payments.start(u.id, user.phone, body.purpose, body.refId, client === 'native');
  }

  private async finish(id: string | undefined, status: string | undefined, base: string, res: FastifyReply) {
    const r = id ? await this.payments.handleCallback(id, status ?? '') : { paid: false as const };
    const path = r.purpose === 'CONSULTATION' ? `/doctors/bookings/${r.refId}` : r.refId ? `/orders/${r.refId}` : '/orders';
    return res.redirect(`${base}${path}?payment=${r.paid ? 'success' : 'failed'}`, 302);
  }

  @Public()
  @Get('bkash/callback')
  callback(@Query('paymentID') id: string | undefined, @Query('status') status: string | undefined, @Res() res: FastifyReply) {
    return this.finish(id, status, this.env.STORE_URL, res);
  }

  /** The same, but returns to the installed app, where the customer's session lives. */
  @Public()
  @Get('bkash/app-callback')
  appCallback(@Query('paymentID') id: string | undefined, @Query('status') status: string | undefined, @Res() res: FastifyReply) {
    return this.finish(id, status, 'barakabari://app', res);
  }

  /** A stand-in for bKash's hosted page. It answers 404 unless BKASH_MODE=fake, which production refuses. */
  @Public()
  @Get('fake-bkash')
  @Header('content-type', 'text/html; charset=utf-8')
  fake(@Query('paymentID') id = '', @Query('callback') cb = '', @Query('amount') amount = '') {
    if (this.env.BKASH_MODE !== 'fake') throw notFound();
    const allowed = ['callback', 'app-callback'].map((p) => `${this.env.PUBLIC_API_BASE}/payments/bkash/${p}`);
    if (!allowed.includes(cb)) throw badRequest('BAD_CALLBACK', 'Invalid callback');
    const link = (s: string) => `${cb}?paymentID=${encodeURIComponent(id)}&status=${s}`;
    return `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Test bKash</title>
<body style="font:16px system-ui;padding:32px;text-align:center"><h2>Test payment: ৳${esc(amount)}</h2><p>Development only. No money moves.</p>
<p><a id=pay href="${esc(link('success'))}">Pay</a> &nbsp; <a id=cancel href="${esc(link('cancel'))}">Cancel</a></p>`;
  }

  @RequirePermission('consultation:manage')
  @Post(':id/refund')
  refund(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.payments.refund(id, u.id);
  }
}

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): PaymentProvider => (env.BKASH_MODE === 'fake' ? new FakeBkashProvider(env.PUBLIC_API_BASE) : new BkashProvider(env)),
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
