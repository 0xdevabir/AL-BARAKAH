import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import 'reflect-metadata';
import { createPrisma, type PrismaClient } from '@albarakah/database';
import { ModulesContainer } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let app: NestFastifyApplication;
let prisma: PrismaClient;
let tokens: { sign(u: { id: string; role: string; mfa: boolean }): Promise<string> };
let zoneId: string;
let categoryId: string;

const uniq = () => randomUUID().replaceAll('-', '').slice(0, 12);
let phoneSeq = 0;
const nextPhone = () => `+88017${String(Date.now() % 100_000_000).padStart(8, '0').slice(0, 5)}${String(phoneSeq++ % 1000).padStart(3, '0')}`;

interface Actor { id: string; auth: string }

async function actor(role: 'CUSTOMER' | 'ADMIN' | 'RIDER' | 'DOCTOR', mfa = role === 'ADMIN'): Promise<Actor> {
  const u = await prisma.user.create({ data: { phone: nextPhone(), name: `${role} ${uniq()}`, role } });
  return { id: u.id, auth: `Bearer ${await tokens.sign({ id: u.id, role, mfa })}` };
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, who?: Actor, body?: object) {
  const res = await app.inject({ method, url, headers: who ? { authorization: who.auth } : {}, ...(body ? { payload: body } : {}) });
  let json: any = null;
  try { json = res.json(); } catch { /* redirects and HTML have no JSON body */ }
  return { status: res.statusCode, json, headers: res.headers };
}

async function medicine(batches: { qty: number; expiresAt: string; batchNo?: string }[]) {
  const id = uniq();
  const m = await prisma.medicine.create({ data: { slug: `t-${id}`, name: `Test ${id}`, genericName: 'Testium', form: 'Tablet', pricePoisha: 1000, categoryId } });
  for (const b of batches) await prisma.batch.create({ data: { medicineId: m.id, batchNo: b.batchNo ?? uniq(), expiresAt: new Date(b.expiresAt), qtyRemaining: b.qty } });
  return m;
}

const address = (userId: string) => prisma.address.create({ data: { userId, label: 'Hall 1', line: 'Daffodil International University, Hall 1', phone: '+8801700000000', zoneId } });

async function orderBody(customer: Actor, medicineId: string, qty = 1, extra: object = {}) {
  const addr = await address(customer.id);
  const { json } = await call('GET', '/delivery-slots');
  return { idempotencyKey: randomUUID(), addressId: addr.id, type: 'NORMAL', slotStart: json.slots[0].start, paymentMethod: 'COD', items: [{ medicineId, qty }], ...extra };
}

async function doctor() {
  const who = await actor('DOCTOR');
  const d = await prisma.doctor.create({
    data: {
      userId: who.id, bmdcNo: `A-${uniq()}`, specialty: 'Medicine', channels: ['GOOGLE_MEET', 'WHATSAPP'], meetLink: 'https://meet.google.com/abc-defg-hij', whatsapp: '+8801711111111',
      availability: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 0, endMinute: 1440, slotMinutes: 15 })) },
    },
  });
  return { who, id: d.id };
}

const stock = async (medicineId: string) => (await prisma.batch.aggregate({ where: { medicineId }, _sum: { qtyRemaining: true } }))._sum.qtyRemaining;

beforeAll(async () => {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'));
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/albarakah_test';
  Object.assign(process.env, { DATABASE_URL: url.toString(), NODE_ENV: 'test', SERVICE_ROLE: 'api', BKASH_MODE: 'fake' });
  // @ts-expect-error compiled output has no declarations in this config
  const { createApp } = await import('../dist/bootstrap.js');
  // @ts-expect-error same as above
  const { loadEnv } = await import('../dist/config/env.js');
  // @ts-expect-error same as above
  const { TokenService } = await import('../dist/common/auth.js');
  app = await createApp(loadEnv(), { rateLimit: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  tokens = app.get(TokenService, { strict: false });
  prisma = createPrisma(url.toString(), 5);
  const tag = uniq();
  zoneId = (await prisma.zone.create({ data: { name: `Zone ${tag}`, deliveryFeePoisha: 4000 } })).id;
  categoryId = (await prisma.category.create({ data: { name: `Cat ${tag}`, slug: `cat-${tag}` } })).id;
});

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
});

describe('route access', () => {
  const PUBLIC_ALLOWED = new Set([
    'AuthController.request', 'AuthController.verify', 'AuthController.refresh', 'AuthController.logout',
    'HealthController.health', 'SettingsController.publicSettings',
    'CatalogController.list', 'CatalogController.one', 'CatalogController.categories', 'CatalogController.zones',
    'OrdersController.slots', 'OrdersController.stream',
    'PaymentsController.callback', 'PaymentsController.fake',
    'ConsultationsController.doctors', 'ConsultationsController.slots',
  ]);

  it('every route declares an access rule, and only the agreed routes are public', () => {
    const found: string[] = [];
    let routes = 0;
    for (const mod of app.get(ModulesContainer).values()) {
      for (const { metatype } of mod.controllers.values()) {
        const proto = (metatype as any).prototype;
        for (const name of Object.getOwnPropertyNames(proto)) {
          const handler = proto[name];
          if (name === 'constructor' || Reflect.getMetadata('method', handler) === undefined) continue;
          routes++;
          const keys = Reflect.getMetadataKeys(handler).map(String);
          const isPublic = keys.some((k) => /public/i.test(k));
          const guarded = keys.some((k) => /permission|authenticated/i.test(k));
          expect(isPublic || guarded, `${metatype!.name}.${name} has no access rule`).toBe(true);
          if (isPublic) found.push(`${metatype!.name}.${name}`);
        }
      }
    }
    expect(routes).toBeGreaterThan(40);
    expect(found.filter((f) => !PUBLIC_ALLOWED.has(f))).toEqual([]);
  });

  it('a customer cannot reach admin routes, and an admin needs a second factor', async () => {
    const customer = await actor('CUSTOMER');
    expect((await call('GET', '/admin/orders', customer)).status).toBe(403);
    expect((await call('GET', '/admin/orders', await actor('ADMIN', false))).status).toBe(403);
    expect((await call('GET', '/admin/orders', await actor('ADMIN'))).status).toBe(200);
    expect((await call('GET', '/admin/orders')).status).toBe(401);
  });

  it('a forged token is rejected', async () => {
    const res = await call('GET', '/orders', { id: 'x', auth: 'Bearer aaa.bbb.ccc' });
    expect(res.status).toBe(401);
  });
});

describe('placing orders', () => {
  it('sells the last unit exactly once under concurrent orders', async () => {
    const m = await medicine([{ qty: 1, expiresAt: '2030-01-01' }]);
    const customers = await Promise.all(Array.from({ length: 8 }, () => actor('CUSTOMER')));
    const bodies = await Promise.all(customers.map((c) => orderBody(c, m.id)));
    const results = await Promise.all(customers.map((c, i) => call('POST', '/orders', c, bodies[i])));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409 && r.json.code === 'OUT_OF_STOCK')).toHaveLength(7);
    expect(await stock(m.id)).toBe(0);
  });

  it('a repeated request creates one order, even when sent at the same moment', async () => {
    const m = await medicine([{ qty: 10, expiresAt: '2030-01-01' }]);
    const c = await actor('CUSTOMER');
    const body = await orderBody(c, m.id, 2);
    const results = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/orders', c, body)));
    expect(new Set(results.map((r) => r.json.id)).size).toBe(1);
    expect(await stock(m.id)).toBe(8);
  });

  it('takes the earliest expiry first, skips expired stock, and restocks on cancel', async () => {
    const m = await medicine([
      { qty: 5, expiresAt: '2020-01-01', batchNo: 'expired' },
      { qty: 2, expiresAt: '2031-01-01', batchNo: 'later' },
      { qty: 2, expiresAt: '2030-01-01', batchNo: 'sooner' },
    ]);
    const c = await actor('CUSTOMER');
    const { json: order, status } = await call('POST', '/orders', c, await orderBody(c, m.id, 3));
    expect(status).toBe(201);
    const left = await prisma.batch.findMany({ where: { medicineId: m.id } });
    const qty = (no: string) => left.find((b) => b.batchNo === no)!.qtyRemaining;
    expect([qty('expired'), qty('sooner'), qty('later')]).toEqual([5, 0, 1]);
    expect((await call('POST', `/orders/${order.id}/cancel`, c)).status).toBe(201);
    expect(await stock(m.id)).toBe(9);
    expect((await call('POST', `/orders/${order.id}/cancel`, c)).status).toBe(409);
    expect(await stock(m.id)).toBe(9);
  });

  it('calculates totals on the server and rejects a slot that is too soon', async () => {
    const m = await medicine([{ qty: 5, expiresAt: '2030-01-01' }]);
    const c = await actor('CUSTOMER');
    const { json } = await call('POST', '/orders', c, await orderBody(c, m.id, 2));
    expect(json.totalPoisha).toBe(2000 + 4000);
    const soon = await orderBody(c, m.id, 1, { slotStart: new Date(Date.now() + 3_600_000).toISOString() });
    expect((await call('POST', '/orders', c, soon)).json.code).toBe('SLOT_UNAVAILABLE');
  });

  it('refuses another customer\'s address, order or prescription file', async () => {
    const m = await medicine([{ qty: 5, expiresAt: '2030-01-01' }]);
    const [a, b] = [await actor('CUSTOMER'), await actor('CUSTOMER')];
    const bodyA = await orderBody(a, m.id);
    expect((await call('POST', '/orders', b, bodyA)).status).toBe(404);
    const { json: order } = await call('POST', '/orders', a, bodyA);
    expect((await call('GET', `/orders/${order.id}`, b)).status).toBe(404);
    expect((await call('POST', `/orders/${order.id}/cancel`, b)).status).toBe(404);
    const rx = await orderBody(b, m.id, 1, { prescriptionKey: `rx/${a.id}/file.pdf` });
    expect((await call('POST', '/orders', b, rx)).status).toBe(403);
  });
});

describe('delivery', () => {
  async function assigned() {
    const m = await medicine([{ qty: 5, expiresAt: '2030-01-01' }]);
    const [c, admin, rider] = [await actor('CUSTOMER'), await actor('ADMIN'), await actor('RIDER')];
    const { json: order } = await call('POST', '/orders', c, await orderBody(c, m.id, 1, { prescriptionKey: undefined }));
    for (const to of ['CONFIRMED', 'PACKED']) expect((await call('PATCH', `/admin/orders/${order.id}/status`, admin, { to })).status).toBe(200);
    expect((await call('PATCH', `/admin/orders/${order.id}/status`, admin, { to: 'ASSIGNED', riderId: rider.id })).status).toBe(200);
    return { order, c, admin, rider };
  }

  it('COD delivery pays the rider once and records the cash held', async () => {
    const { order, rider, admin } = await assigned();
    const url = `/delivery/jobs/${order.id}/status`;
    expect((await call('PATCH', url, rider, { to: 'OUT_FOR_DELIVERY' })).status).toBe(200);
    const results = await Promise.all(Array.from({ length: 4 }, () => call('PATCH', url, rider, { to: 'DELIVERED' })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const ledger = (await call('GET', '/delivery/ledger', rider)).json;
    expect(ledger.codCollectedPoisha).toBe(order.totalPoisha);
    expect(ledger.earnedPoisha).toBe(order.riderPayoutPoisha);
    await call('POST', `/admin/riders/${rider.id}/settle`, admin, { amountPoisha: order.totalPoisha });
    expect((await call('GET', '/delivery/ledger', rider)).json.cashHeldPoisha).toBe(0);
  });

  it('a rider sees only their own jobs and no prescription data', async () => {
    const { order, rider } = await assigned();
    const other = await actor('RIDER');
    expect((await call('PATCH', `/delivery/jobs/${order.id}/status`, other, { to: 'OUT_FOR_DELIVERY' })).status).toBe(404);
    expect((await call('GET', '/delivery/jobs', other)).json).toEqual([]);
    const jobs = (await call('GET', '/delivery/jobs', rider)).json;
    expect(jobs.map((j: { id: string }) => j.id)).toEqual([order.id]);
    expect(JSON.stringify(jobs)).not.toContain('prescription');
    expect((await call('GET', `/admin/orders/${order.id}/prescription`, rider)).status).toBe(403);
  });

  it('a customer sees the rider\'s phone only while the order is out for delivery', async () => {
    const { order, c, rider } = await assigned();
    expect((await call('GET', `/orders/${order.id}`, c)).json.rider).toBeNull();
    await call('PATCH', `/delivery/jobs/${order.id}/status`, rider, { to: 'OUT_FOR_DELIVERY' });
    const seen = (await call('GET', `/orders/${order.id}`, c)).json;
    expect(seen.rider.name).toBeTruthy();
    expect(seen.riderPayoutPoisha).toBeUndefined();
  });
});

describe('doctor bookings and bKash', () => {
  async function slotOf(doctorId: string) {
    return (await call('GET', `/doctors/${doctorId}/slots`)).json[0].start as string;
  }

  it('gives one slot to exactly one of many simultaneous customers', async () => {
    const d = await doctor();
    const startsAt = await slotOf(d.id);
    const customers = await Promise.all(Array.from({ length: 8 }, () => actor('CUSTOMER')));
    const results = await Promise.all(customers.map((c) => call('POST', '/consultations', c, { doctorId: d.id, startsAt, channel: 'GOOGLE_MEET' })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409 && r.json.code === 'SLOT_TAKEN')).toHaveLength(7);
  });

  async function booked() {
    const d = await doctor();
    const c = await actor('CUSTOMER');
    const { json: booking } = await call('POST', '/consultations', c, { doctorId: d.id, startsAt: await slotOf(d.id), channel: 'GOOGLE_MEET' });
    const { json: pay } = await call('POST', '/payments/start', c, { purpose: 'CONSULTATION', refId: booking.id });
    const providerId = new URL(pay.redirectUrl).searchParams.get('paymentID')!;
    return { d, c, booking, pay, providerId };
  }

  it('hides the meeting link until paid, and duplicate callbacks settle once', async () => {
    const { c, booking, pay, providerId } = await booked();
    expect((await call('GET', `/consultations/${booking.id}`, c)).json.doctor.meetLink).toBeNull();
    const cb = `/payments/bkash/callback?paymentID=${providerId}&status=success`;
    const results = await Promise.all(Array.from({ length: 6 }, () => call('GET', cb)));
    expect(results.every((r) => r.status === 302 && String(r.headers.location).includes('payment=success'))).toBe(true);
    const seen = (await call('GET', `/consultations/${booking.id}`, c)).json;
    expect(seen.status).toBe('CONFIRMED');
    expect(seen.doctor.meetLink).toContain('meet.google.com');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: pay.paymentId } });
    expect(payment.status).toBe('PAID');
  });

  it('a cancelled payment keeps the booking unpaid, and unknown callbacks do nothing', async () => {
    const { c, booking, providerId } = await booked();
    const r = await call('GET', `/payments/bkash/callback?paymentID=${providerId}&status=cancel`);
    expect(String(r.headers.location)).toContain('payment=failed');
    expect((await call('GET', `/consultations/${booking.id}`, c)).json.status).toBe('HOLD');
    const unknown = await call('GET', '/payments/bkash/callback?paymentID=nope&status=success');
    expect(String(unknown.headers.location)).toContain('payment=failed');
  });

  it('an expired hold frees the slot and can no longer be paid', async () => {
    const d = await doctor();
    const c = await actor('CUSTOMER');
    const startsAt = await slotOf(d.id);
    const { json: booking } = await call('POST', '/consultations', c, { doctorId: d.id, startsAt, channel: 'WHATSAPP' });
    await prisma.consultation.update({ where: { id: booking.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    expect((await call('POST', '/payments/start', c, { purpose: 'CONSULTATION', refId: booking.id })).status).toBe(409);
    const again = await call('POST', '/consultations', await actor('CUSTOMER'), { doctorId: d.id, startsAt, channel: 'WHATSAPP' });
    expect(again.status).toBe(201);
  });

  it('a payment arriving after the hold lapsed is flagged for refund', async () => {
    const { booking, pay, providerId } = await booked();
    await prisma.consultation.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
    await call('GET', `/payments/bkash/callback?paymentID=${providerId}&status=success`);
    const flag = await prisma.auditLog.findFirst({ where: { action: 'payment.needs_refund', entityId: pay.paymentId } });
    expect(flag).not.toBeNull();
  });

  it('a refund goes through once', async () => {
    const { pay, providerId } = await booked();
    await call('GET', `/payments/bkash/callback?paymentID=${providerId}&status=success`);
    const admin = await actor('ADMIN');
    const results = await Promise.all(Array.from({ length: 3 }, () => call('POST', `/payments/${pay.paymentId}/refund`, admin)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it('a doctor sees only their own bookings', async () => {
    const { d, booking, providerId } = await booked();
    await call('GET', `/payments/bkash/callback?paymentID=${providerId}&status=success`);
    const other = await doctor();
    expect((await call('GET', '/doctor/bookings', other.who)).json).toEqual([]);
    expect((await call('PATCH', `/doctor/bookings/${booking.id}`, other.who, { status: 'COMPLETED' })).status).toBe(404);
    expect((await call('PATCH', `/doctor/bookings/${booking.id}`, d.who, { status: 'COMPLETED' })).status).toBe(200);
  });
});

describe('prescription storage', () => {
  it('uploads through a signed URL, reads back through a signed URL, and blocks anonymous reads', async () => {
    const c = await actor('CUSTOMER');
    const { json } = await call('POST', '/prescriptions/upload-url', c, { contentType: 'image/png' });
    expect(json.key.startsWith(`rx/${c.id}/`)).toBe(true);
    const put = await fetch(json.url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: 'not really a png' });
    expect(put.status).toBe(200);
    const plain = new URL(json.url);
    plain.search = '';
    expect((await fetch(plain)).status).toBe(403);

    const m = await medicine([{ qty: 1, expiresAt: '2030-01-01' }]);
    const { json: order } = await call('POST', '/orders', c, await orderBody(c, m.id, 1, { prescriptionKey: json.key }));
    const read = await call('GET', `/admin/orders/${order.id}/prescription`, await actor('ADMIN'));
    expect(await (await fetch(read.json.url)).text()).toBe('not really a png');
    expect(await prisma.auditLog.count({ where: { action: 'prescription.view', entityId: order.id } })).toBe(1);
  });
});
