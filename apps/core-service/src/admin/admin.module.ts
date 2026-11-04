import { Controller, Get, Inject, Module, Param, Query } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@albarakah/database';
import { notFound, PRISMA, RequirePermission } from '@albarakah/nest-common';

const DAY = 86_400_000;
/** The dashboard is read on every admin page load; a short cache keeps it off the database. */
const CACHE_MS = 20_000;
const ACTIVE = ['PLACED', 'CONFIRMED', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY'] as const;

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
const pct = (now: number, before: number) => (before === 0 ? (now > 0 ? 1 : 0) : (now - before) / before);

@Controller('admin')
export class AdminController {
  private cache = new Map<string, { at: number; value: unknown }>();

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  @RequirePermission('analytics:read')
  @Get('dashboard')
  dashboard(@Query('days') daysParam?: string) {
    const days = [7, 14, 30, 90].includes(Number(daysParam)) ? Number(daysParam) : 14;
    return this.cached(`dash:${days}`, () => this.buildDashboard(days));
  }

  private async buildDashboard(days: number) {
    const now = new Date();
    const today = startOfDay(now);
    const from = new Date(today.getTime() - (days - 1) * DAY);
    const prevFrom = new Date(from.getTime() - days * DAY);
    const in60 = new Date(today.getTime() + 60 * DAY);

    const [series, prev, byStatus, top, late, lowStock, expiring, newCustomers, prevCustomers, consults, ratings, pendingRx, cashOut, refunds] = await Promise.all([
      this.prisma.$queryRaw<{ day: Date; orders: bigint; revenue: bigint; delivered: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS orders,
               COALESCE(SUM("totalPoisha") FILTER (WHERE status = 'DELIVERED'), 0) AS revenue,
               COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered
        FROM "Order" WHERE "createdAt" >= ${from}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ orders: bigint; revenue: bigint }[]>`
        SELECT COUNT(*) AS orders, COALESCE(SUM("totalPoisha") FILTER (WHERE status = 'DELIVERED'), 0) AS revenue
        FROM "Order" WHERE "createdAt" >= ${prevFrom} AND "createdAt" < ${from}`,
      this.prisma.order.groupBy({ by: ['status'], where: { createdAt: { gte: from } }, _count: true }),
      this.prisma.$queryRaw<{ medicineId: string; name: string; qty: bigint; revenue: bigint }[]>`
        SELECT oi."medicineId", MAX(oi."nameSnapshot") AS name, SUM(oi.qty) AS qty, SUM(oi.qty * oi."unitPricePoisha") AS revenue
        FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."createdAt" >= ${from} AND o.status NOT IN ('CANCELLED', 'FAILED')
        GROUP BY oi."medicineId" ORDER BY qty DESC LIMIT 8`,
      this.prisma.order.findMany({
        where: { status: { in: [...ACTIVE] }, promisedBy: { lt: now } },
        orderBy: { promisedBy: 'asc' },
        take: 10,
        select: { id: true, code: true, status: true, type: true, promisedBy: true, customer: { select: { name: true } }, rider: { select: { name: true } } },
      }),
      this.prisma.$queryRaw<{ id: string; name: string; strength: string; stock: bigint; reorderLevel: number }[]>`
        SELECT m.id, m.name, m.strength, COALESCE(SUM(b."qtyRemaining") FILTER (WHERE b."expiresAt" >= CURRENT_DATE), 0) AS stock, m."reorderLevel"
        FROM "Medicine" m LEFT JOIN "Batch" b ON b."medicineId" = m.id
        WHERE m."isActive"
        GROUP BY m.id
        HAVING COALESCE(SUM(b."qtyRemaining") FILTER (WHERE b."expiresAt" >= CURRENT_DATE), 0) <= m."reorderLevel"
        ORDER BY stock ASC, m.name LIMIT 12`,
      this.prisma.batch.findMany({
        where: { qtyRemaining: { gt: 0 }, expiresAt: { lt: in60 } },
        orderBy: { expiresAt: 'asc' },
        take: 12,
        select: { id: true, batchNo: true, expiresAt: true, qtyRemaining: true, medicine: { select: { id: true, name: true, strength: true } } },
      }),
      this.prisma.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: from } } }),
      this.prisma.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: prevFrom, lt: from } } }),
      this.prisma.consultation.groupBy({ by: ['status'], where: { startsAt: { gte: from } }, _count: true, _sum: { feePoisha: true } }),
      this.prisma.order.aggregate({ where: { rating: { not: null }, createdAt: { gte: from } }, _avg: { rating: true }, _count: { rating: true } }),
      this.prisma.order.count({ where: { status: 'PLACED', prescriptionKey: { not: null } } }),
      this.prisma.$queryRaw<{ held: bigint }[]>`
        SELECT COALESCE(SUM(CASE WHEN type = 'COD_COLLECTED' THEN "amountPoisha" WHEN type = 'SETTLEMENT' THEN -"amountPoisha" ELSE 0 END), 0) AS held
        FROM "RiderLedgerEntry"`,
      this.prisma.auditLog.count({ where: { action: 'payment.needs_refund', createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    ]);

    const byDay = new Map(series.map((r) => [startOfDay(new Date(r.day)).getTime(), r]));
    const points = Array.from({ length: days }, (_, i) => {
      const d = new Date(from.getTime() + i * DAY);
      const r = byDay.get(startOfDay(d).getTime());
      return { date: d.toISOString(), orders: Number(r?.orders ?? 0), revenuePoisha: Number(r?.revenue ?? 0), delivered: Number(r?.delivered ?? 0) };
    });
    const orders = points.reduce((s, p) => s + p.orders, 0);
    const revenue = points.reduce((s, p) => s + p.revenuePoisha, 0);
    const delivered = points.reduce((s, p) => s + p.delivered, 0);
    const prevOrders = Number(prev[0]?.orders ?? 0);
    const prevRevenue = Number(prev[0]?.revenue ?? 0);
    const statusCounts = Object.fromEntries(byStatus.map((g) => [g.status, g._count]));
    const cancelled = (statusCounts.CANCELLED ?? 0) + (statusCounts.FAILED ?? 0);
    const todayPoint = points[points.length - 1]!;

    return {
      days,
      kpis: {
        revenuePoisha: revenue, revenueChange: pct(revenue, prevRevenue),
        orders, ordersChange: pct(orders, prevOrders),
        avgOrderPoisha: delivered ? Math.round(revenue / delivered) : 0,
        newCustomers, newCustomersChange: pct(newCustomers, prevCustomers),
        cancelRate: orders ? cancelled / orders : 0,
        rating: ratings._avg.rating, ratingCount: ratings._count.rating,
        todayOrders: todayPoint.orders, todayRevenuePoisha: todayPoint.revenuePoisha,
        lateNow: late.length, pendingRx, cashWithRidersPoisha: Number(cashOut[0]?.held ?? 0), refundsNeeded: refunds,
      },
      series: points,
      byStatus: statusCounts,
      topMedicines: top.map((t) => ({ medicineId: t.medicineId, name: t.name, qty: Number(t.qty), revenuePoisha: Number(t.revenue) })),
      late,
      lowStock: lowStock.map((m) => ({ ...m, stock: Number(m.stock) })),
      expiring,
      consultations: Object.fromEntries(consults.map((c) => [c.status, { count: c._count, feePoisha: c._sum.feePoisha ?? 0 }])),
      generatedAt: now.toISOString(),
    };
  }

  @RequirePermission('customer:read')
  @Get('customers')
  async customers(@Query('q') q?: string, @Query('page') page?: string) {
    const term = q?.trim();
    const where: Prisma.UserWhereInput = {
      role: 'CUSTOMER',
      ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { phone: { contains: term.replace(/\s/g, '') } }, { email: { contains: term.toLowerCase() } }] } : {}),
    };
    const size = 30;
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (Math.max(Number(page) || 1, 1) - 1) * size,
      take: size,
      select: { id: true, name: true, phone: true, email: true, isActive: true, createdAt: true, _count: { select: { orders: true, consultations: true } } },
    });
    const spend = users.length
      ? await this.prisma.order.groupBy({ by: ['customerId'], where: { customerId: { in: users.map((u) => u.id) }, status: 'DELIVERED' }, _sum: { totalPoisha: true }, _max: { createdAt: true } })
      : [];
    const byId = new Map(spend.map((s) => [s.customerId, s]));
    return users.map((u) => ({
      ...u, orders: u._count.orders, consultations: u._count.consultations, _count: undefined,
      spentPoisha: byId.get(u.id)?._sum.totalPoisha ?? 0, lastOrderAt: byId.get(u.id)?._max.createdAt ?? null,
    }));
  }

  @RequirePermission('customer:read')
  @Get('customers/:id')
  async customer(@Param('id') id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: 'CUSTOMER' },
      select: {
        id: true, name: true, phone: true, email: true, isActive: true, createdAt: true,
        addresses: { where: { isDeleted: false }, select: { id: true, label: true, line: true, phone: true, zone: { select: { name: true } } } },
      },
    });
    if (!user) throw notFound('Customer not found');
    const [orders, consultations, totals] = await Promise.all([
      this.prisma.order.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, code: true, status: true, totalPoisha: true, createdAt: true, type: true, rating: true } }),
      this.prisma.consultation.findMany({ where: { customerId: id, status: { not: 'CANCELLED' } }, orderBy: { startsAt: 'desc' }, take: 20, select: { id: true, code: true, status: true, startsAt: true, doctor: { select: { user: { select: { name: true } } } } } }),
      this.prisma.order.aggregate({ where: { customerId: id, status: 'DELIVERED' }, _sum: { totalPoisha: true }, _count: true }),
    ]);
    return { ...user, orders, consultations, spentPoisha: totals._sum.totalPoisha ?? 0, deliveredOrders: totals._count };
  }

  @RequirePermission('audit:read')
  @Get('audit')
  async audit(@Query('action') action?: string, @Query('before') before?: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { ...(action ? { action: { startsWith: action } } : {}), ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { name: true, role: true, phone: true } } },
    });
    return { items: rows, next: rows.length === 50 ? rows[rows.length - 1]!.createdAt.toISOString() : null };
  }
}

@Module({ controllers: [AdminController] })
export class AdminModule {}
