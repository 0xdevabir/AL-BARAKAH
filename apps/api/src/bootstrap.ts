import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

export async function createApp(env: Env, opts: { rateLimit?: boolean } = {}): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    // Trust exactly one proxy (nginx), so clients cannot spoof their IP past the rate limits.
    trustProxy: env.NODE_ENV === 'production' ? (_address: string, hop: number) => hop < 1 : false,
    bodyLimit: 256 * 1024,
    // A short deadline, so one stuck request cannot pile up on low server resources.
    requestTimeout: 30_000,
    logger: env.NODE_ENV === 'test' ? false : { level: env.NODE_ENV === 'production' ? 'info' : 'warn' },
    genReqId: (req: IncomingMessage) => (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || randomUUID(),
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRole(env.SERVICE_ROLE), adapter, {
    logger: env.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'],
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['authorization', 'content-type', 'x-client', 'x-request-id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  if (opts.rateLimit !== false) {
    await app.register(rateLimit, {
      global: true,
      max: env.RATE_LIMIT_PER_MINUTE,
      timeWindow: '1 minute',
      redis: new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false }),
      // Rate limiting must not take the shop down if Redis blips.
      skipOnError: true,
    });
  }
  app.enableShutdownHooks();
  return app;
}
