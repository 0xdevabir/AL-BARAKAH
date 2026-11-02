import { Controller, Get, Inject, Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { PrismaClient } from '@albarakah/database';
import type { Redis } from 'ioredis';
import { AuthModule } from './auth/auth.controller.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { AccessGuard, Public } from './common/auth.js';
import { AllExceptionsFilter } from './common/errors.js';
import { InfraModule, PRISMA, REDIS } from './common/infra.module.js';
import { ConsultationsModule } from './consultations/consultations.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { WorkerModule } from './worker/worker.module.js';

@Controller()
export class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient, @Inject(REDIS) private readonly redis: Redis) {}

  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    await this.redis.ping();
    return { ok: true };
  }
}

@Module({})
export class AppModule {
  static forRole(role: 'api' | 'worker' | 'all'): DynamicModule {
    return {
      module: AppModule,
      imports: [
        InfraModule, AuthModule, SettingsModule, CatalogModule, OrdersModule, PaymentsModule, ConsultationsModule,
        ...(role === 'api' ? [] : [WorkerModule]),
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }
}
