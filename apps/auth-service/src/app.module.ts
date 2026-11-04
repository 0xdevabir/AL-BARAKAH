import { Controller, Get, Inject, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { PrismaClient } from '@albarakah/database';
import type { Redis } from 'ioredis';
import {
  AccessGuard,
  AllExceptionsFilter,
  InfraModule,
  PRISMA,
  Public,
  REDIS,
} from '@albarakah/nest-common';
import { AuthModule } from './auth/auth.controller.js';
import { SmsWorkerModule } from './notifications/sms.worker.js';

@Controller()
export class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient, @Inject(REDIS) private readonly redis: Redis) {}

  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    await this.redis.ping();
    return { ok: true, service: 'auth' };
  }
}

@Module({
  imports: [InfraModule, AuthModule, SmsWorkerModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
