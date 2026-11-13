import { Body, Controller, Delete, Get, Inject, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { expenseSchema, medicineRequestSchema, medicineRequestStatusSchema } from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import { commissionPoisha } from '@albarakah/domain';
import type { z } from 'zod';
import { type AuthUser, badRequest, CurrentUser, notFound, PRISMA, RequirePermission, ZodPipe } from '@albarakah/nest-common';
import { activeAdminIds, notify } from '../notifications/notify.js';
import { SettingsModule, SettingsService } from '../settings/settings.module.js';

const DAY = 86_400_000;
const DHAKA = 6 * 3_600_000;

/** `YYYY-MM-DD` Dhaka calendar days → a UTC [from, to) range. Defaults to this month so far. */
function range(fromQ?: string, toQ?: string) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date(Date.now() + DHAKA).toISOString().slice(0, 10);
  const to = toQ && iso.test(toQ) ? toQ : today;
  const from = fromQ && iso.test(fromQ) ? fromQ : `${to.slice(0, 8)}01`;
  const start = new Date(`${from}T00:00:00+06:00`);
  const end = new Date(new Date(`${to}T00:00:00+06:00`).getTime() + DAY);
  if (!(start < end) || end.getTime() - start.getTime() > 366 * DAY) throw badRequest('RANGE', 'Choose a range of up to a year');
  return { from, to, start, end };
}

@Controller()
export class PortalController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
  ) {}

  // ---- inbox: every role reads only its own ----
  @RequirePermission('self:read')
  @Get('notifications')
  async inbox(@CurrentUser() u: AuthUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId: u.id, readAt: null } }),
    ]);
    return { items, unread };
  }

  @RequirePermission('self:read')
  @Post('notifications/read')
  async readAll(@CurrentUser() u: AuthUser, @Body() body: { id?: unknown }) {
    const id = typeof body?.id === 'string' ? body.id : undefined;
    await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // ---- customers ask for medicines the pharmacy doesn't stock ----
  @RequirePermission('medicine-request:create')
  @Post('medicine-requests')
  async request(@CurrentUser() u: AuthUser, @Body(new ZodPipe(medicineRequestSchema)) body: z.output<typeof medicineRequestSchema>) {
    if (body.medicineId && !(await this.prisma.medicine.findUnique({ where: { id: body.medicineId }, select: { id: true } }))) {
      throw notFound('Medicine not found');
    }
    // One open request per medicine per customer is enough to count demand.
    const open = await this.prisma.medicineRequest.findFirst({
      where: { userId: u.id, status: { in: ['OPEN', 'SOURCING'] }, ...(body.medicineId ? { medicineId: body.medicineId } : { name: { equals: body.name, mode: 'insensitive' } }) },
    });
    if (open) return open;
    const r = await this.prisma.medicineRequest.create({ data: { ...body, userId: u.id } });
    const admins = await activeAdminIds(this.prisma);
    await notify(this.prisma, admins.map((a) => ({ userId: a.id, kind: 'medicine.request', title: `Medicine requested: ${body.name}`, body: `Qty ${body.qty}${body.note ? ` · ${body.note}` : ''}`, link: '/admin/medicines?tab=requests' })));
    return r;
  }

  @RequirePermission('medicine-request:create')
  @Get('medicine-requests')
  mine(@CurrentUser() u: AuthUser) {
    return this.prisma.medicineRequest.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  @RequirePermission('catalog:manage')
  @Get('admin/medicine-requests')
  async requests(@Query('status') status?: string) {
    const st = ['OPEN', 'SOURCING', 'FULFILLED', 'CLOSED'].includes(status ?? '') ? (status as 'OPEN') : undefined;
    const rows = await this.prisma.medicineRequest.findMany({
      where: st ? { status: st } : { status: { in: ['OPEN', 'SOURCING'] } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { name: true, phone: true } }, medicine: { select: { id: true, name: true, strength: true, sourcingDays: true } } },
    });
    // Demand: how many people want the same medicine, so the pharmacy sources the most-wanted first.
    const demand = new Map<string, { key: string; name: string; medicineId: string | null; requests: number; qty: number }>();
    for (const r of rows) {
      const key = r.medicineId ?? r.name.trim().toLowerCase();
      const d = demand.get(key) ?? { key, name: r.medicine?.name ?? r.name, medicineId: r.medicineId, requests: 0, qty: 0 };
      d.requests += 1;
      d.qty += r.qty;
      demand.set(key, d);
    }
    return { rows, demand: [...demand.values()].sort((a, b) => b.requests - a.requests || b.qty - a.qty) };
  }

  @RequirePermission('catalog:manage')
  @Patch('admin/medicine-requests/:id')
  async setRequestStatus(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(medicineRequestStatusSchema)) body: z.output<typeof medicineRequestStatusSchema>) {
    const r = await this.prisma.medicineRequest.findUnique({ where: { id } });
    if (!r) throw notFound('Request not found');
    await this.prisma.medicineRequest.update({ where: { id }, data: { status: body.status } });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'medicine.request', entity: 'MedicineRequest', entityId: id, data: body } });
    if (body.status === 'FULFILLED' || body.status === 'SOURCING') {
      await notify(this.prisma, [{
        userId: r.userId, kind: 'medicine.request', link: '/search',
        title: body.status === 'FULFILLED' ? `${r.name} is now available` : `We're sourcing ${r.name} for you`,
      }]);
    }
    return { ok: true };
  }

  // ---- stock at a glance ----
  @RequirePermission('catalog:manage')
  @Get('admin/inventory')
  async inventory() {
    const today = new Date(new Date(Date.now() + DHAKA).toISOString().slice(0, 10));
    const [rows, openRequests] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; name: string; strength: string; reorderLevel: number; sourcingDays: number; pricePoisha: number; packs: bigint; loose: bigint }[]>`
        SELECT m.id, m.name, m.strength, m."reorderLevel", m."sourcingDays", m."pricePoisha",
               COALESCE(SUM(b."qtyRemaining"), 0) AS packs, COALESCE(SUM(b."looseQty"), 0) AS loose
        FROM "Medicine" m LEFT JOIN "Batch" b ON b."medicineId" = m.id AND b."expiresAt" >= ${today}
        WHERE m."isActive" = true
        GROUP BY m.id ORDER BY packs ASC, m.name ASC`,
      this.prisma.medicineRequest.groupBy({ by: ['medicineId'], where: { status: { in: ['OPEN', 'SOURCING'] }, medicineId: { not: null } }, _count: { _all: true } }),
    ]);
    const wanted = new Map(openRequests.map((r) => [r.medicineId!, r._count._all]));
    const items = rows.map((r) => ({
      id: r.id, name: `${r.name} ${r.strength}`.trim(), packs: Number(r.packs), loose: Number(r.loose),
      reorderLevel: r.reorderLevel, sourcingDays: r.sourcingDays, valuePoisha: Number(r.packs) * r.pricePoisha, requests: wanted.get(r.id) ?? 0,
    }));
    return {
      totals: {
        medicines: items.length,
        packsInStock: items.reduce((s, i) => s + i.packs, 0),
        stockValuePoisha: items.reduce((s, i) => s + i.valuePoisha, 0),
        outOfStock: items.filter((i) => i.packs === 0 && i.loose === 0).length,
        low: items.filter((i) => i.packs > 0 && i.packs <= i.reorderLevel).length,
        rare: items.filter((i) => i.sourcingDays > 0).length,
      },
      items,
    };
  }

  // ---- money ----
  @RequirePermission('expense:manage')
  @Get('admin/expenses')
  async expenses(@Query('from') fromQ?: string, @Query('to') toQ?: string) {
    const { start, end, from, to } = range(fromQ, toQ);
    const rows = await this.prisma.expense.findMany({
      where: { spentAt: { gte: start, lt: end } }, orderBy: [{ spentAt: 'desc' }, { createdAt: 'desc' }], take: 500,
      include: { createdBy: { select: { name: true } } },
    });
    return { from, to, rows, totalPoisha: rows.reduce((s, r) => s + r.amountPoisha, 0) };
  }

  @RequirePermission('expense:manage')
  @Post('admin/expenses')
  async addExpense(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(expenseSchema)) body: z.output<typeof expenseSchema>) {
    const e = await this.prisma.expense.create({ data: { ...body, spentAt: new Date(`${body.spentAt}T00:00:00Z`), createdById: actor.id } });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'expense.add', entity: 'Expense', entityId: e.id, data: body } });
    return e;
  }

  @RequirePermission('expense:manage')
  @Delete('admin/expenses/:id')
  async deleteExpense(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    const e = await this.prisma.expense.findUnique({ where: { id } });
    if (!e) throw notFound('Expense not found');
    await this.prisma.$transaction([
      this.prisma.expense.delete({ where: { id } }),
      this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'expense.delete', entity: 'Expense', entityId: id, data: { amountPoisha: e.amountPoisha, category: e.category } } }),
    ]);
    return { ok: true };
  }

  /**
   * Income, spending and commission for a date range. Sales are counted when delivered; consultation
   * commission when the call is completed. Medicine cost price isn't tracked, so "net" is before cost of goods.
   */
  @RequirePermission('analytics:read')
  @Get('admin/finance')
  async finance(@Query('from') fromQ?: string, @Query('to') toQ?: string) {
    const { from, to, start, end } = range(fromQ, toQ);
    const s = await this.settings.get();
    const [sales, consults, riderPay, expenses, byDay] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: 'DELIVERED', deliveredAt: { gte: start, lt: end } },
        _sum: { subtotalPoisha: true, deliveryFeePoisha: true, emergencyFeePoisha: true, totalPoisha: true }, _count: true,
      }),
      this.prisma.consultation.findMany({ where: { status: 'COMPLETED', startsAt: { gte: start, lt: end } }, select: { feePoisha: true, kind: true } }),
      this.prisma.riderLedgerEntry.aggregate({ where: { type: 'EARNING', createdAt: { gte: start, lt: end } }, _sum: { amountPoisha: true } }),
      this.prisma.expense.groupBy({ by: ['category'], where: { spentAt: { gte: start, lt: end } }, _sum: { amountPoisha: true } }),
      this.prisma.$queryRaw<{ day: Date; sales: bigint; orders: bigint }[]>`
        SELECT date_trunc('day', "deliveredAt" + interval '6 hours') AS day, COALESCE(SUM("totalPoisha"), 0) AS sales, COUNT(*) AS orders
        FROM "Order" WHERE status = 'DELIVERED' AND "deliveredAt" >= ${start} AND "deliveredAt" < ${end}
        GROUP BY 1 ORDER BY 1`,
    ]);
    const consultFees = consults.reduce((t, c) => t + c.feePoisha, 0);
    const commission = consults.reduce((t, c) => t + commissionPoisha(c.feePoisha, s.doctorCommissionPct), 0);
    const medicineSales = sales._sum.subtotalPoisha ?? 0;
    const deliveryFees = (sales._sum.deliveryFeePoisha ?? 0) + (sales._sum.emergencyFeePoisha ?? 0);
    const riderPayouts = riderPay._sum.amountPoisha ?? 0;
    const otherExpenses = expenses.reduce((t, e) => t + (e._sum.amountPoisha ?? 0), 0);
    const income = medicineSales + deliveryFees + commission;
    const spending = riderPayouts + otherExpenses;
    return {
      from, to,
      commissionPct: s.doctorCommissionPct,
      sales: { orders: sales._count, medicinePoisha: medicineSales, deliveryFeesPoisha: deliveryFees, grossPoisha: sales._sum.totalPoisha ?? 0 },
      consultations: { count: consults.length, instant: consults.filter((c) => c.kind === 'INSTANT').length, feesPoisha: consultFees, commissionPoisha: commission, doctorSharePoisha: consultFees - commission },
      expenses: {
        riderPayoutsPoisha: riderPayouts,
        byCategory: expenses.map((e) => ({ category: e.category, amountPoisha: e._sum.amountPoisha ?? 0 })).sort((a, b) => b.amountPoisha - a.amountPoisha),
        otherPoisha: otherExpenses,
      },
      incomePoisha: income,
      spendingPoisha: spending,
      netPoisha: income - spending,
      daily: byDay.map((d) => ({ day: d.day.toISOString().slice(0, 10), salesPoisha: Number(d.sales), orders: Number(d.orders) })),
    };
  }
}

@Module({ imports: [SettingsModule], controllers: [PortalController] })
export class PortalModule {}
