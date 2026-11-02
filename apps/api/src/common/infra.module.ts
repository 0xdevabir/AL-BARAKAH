import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { createPrisma, type PrismaClient } from '@albarakah/database';
import { Redis } from 'ioredis';
import { ENV, type Env, loadEnv } from '../config/env.js';
import { TokenService } from './auth.js';

export const PRISMA = Symbol('PRISMA');
export const REDIS = Symbol('REDIS');

@Injectable()
export class InfraLifecycle implements OnModuleDestroy {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient, @Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.prisma.$disconnect();
    this.redis.disconnect();
  }
}

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: PRISMA, inject: [ENV], useFactory: (env: Env) => createPrisma(env.DATABASE_URL) },
    { provide: REDIS, inject: [ENV], useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) },
    TokenService,
    InfraLifecycle,
  ],
  exports: [ENV, PRISMA, REDIS, TokenService],
})
export class InfraModule {}
