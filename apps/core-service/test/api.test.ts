import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import 'reflect-metadata';
import { createPrisma, type PrismaClient } from '@albarakah/database';
import { createNestApp, loadEnv, TokenService } from '@albarakah/nest-common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

let app: NestFastifyApplication;
let prisma: PrismaClient;
let tokens: TokenService;
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

beforeAll(async () => {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'));
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/albarakah_test';
  Object.assign(process.env, { DATABASE_URL: url.toString(), NODE_ENV: 'test', SERVICE_ROLE: 'api', BKASH_MODE: 'fake', DEMO_LOGIN: 'false' });
  app = await createNestApp(loadEnv(), AppModule.forRole('api'), { rateLimit: false });
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

describe('core health', () => {
  it('reports ok', async () => {
    const { status, json } = await call('GET', '/health');
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.service).toBe('core');
  });

  it('lists zones for signed-in customers', async () => {
    const who = await actor('CUSTOMER');
    const { status, json } = await call('GET', '/zones', who);
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    expect(json.some((z: { id: string }) => z.id === zoneId)).toBe(true);
  });

  it('lists categories publicly', async () => {
    const { status, json } = await call('GET', '/categories');
    expect(status).toBe(200);
    expect(json.some((c: { id: string }) => c.id === categoryId)).toBe(true);
  });
});
