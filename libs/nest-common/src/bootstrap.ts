import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { type DynamicModule, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';
import type { Env } from './config/env.js';

export async function createNestApp(
  env: Env,
  root: Type | DynamicModule,
  opts: { rateLimit?: boolean } = {},
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    trustProxy: env.NODE_ENV === 'production' ? (_address: string, hop: number) => hop < 1 : false,
    bodyLimit: 256 * 1024,
    requestTimeout: 30_000,
    logger: env.NODE_ENV === 'test' ? false : { level: env.NODE_ENV === 'production' ? 'info' : 'warn' },
    genReqId: (req: IncomingMessage) => (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || randomUUID(),
  });
  const app = await NestFactory.create<NestFastifyApplication>(root, adapter, {
    logger: env.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'],
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['authorization', 'content-type', 'x-client', 'x-request-id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // Cache preflights so signed-in requests (Authorization header) don't pay an extra OPTIONS round trip each time.
    maxAge: 7200,
  });
  if (opts.rateLimit !== false) {
    await app.register(rateLimit, {
      global: true,
      max: env.RATE_LIMIT_PER_MINUTE,
      timeWindow: '1 minute',
      redis: new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false }),
      skipOnError: true,
    });
  }
  app.enableShutdownHooks();
  return app;
}
