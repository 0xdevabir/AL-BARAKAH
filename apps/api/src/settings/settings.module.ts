import { Body, Controller, Get, Inject, Injectable, Module, Put } from '@nestjs/common';
import { type Settings, settingsSchema } from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import { DEFAULT_FEES, DEFAULT_SCHEDULE } from '@albarakah/domain';
import { type AuthUser, CurrentUser, Public, RequirePermission } from '../common/auth.js';
import { ZodPipe } from '../common/errors.js';
import { PRISMA } from '../common/infra.module.js';

const DEFAULTS: Settings = { ...DEFAULT_FEES, ...DEFAULT_SCHEDULE, requireRxUpload: false };
const CACHE_MS = 15_000;

@Injectable()
export class SettingsService {
  private cached?: { value: Settings; at: number };

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async get(): Promise<Settings> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const row = await this.prisma.setting.findUnique({ where: { key: 'app' } });
    const value = { ...DEFAULTS, ...(row?.value as Partial<Settings> | null) };
    this.cached = { value, at: Date.now() };
    return value;
  }

  async update(value: Settings, actorId: string): Promise<Settings> {
    await this.prisma.$transaction([
      this.prisma.setting.upsert({ where: { key: 'app' }, update: { value }, create: { key: 'app', value } }),
      this.prisma.auditLog.create({ data: { actorId, action: 'settings.update', entity: 'Setting', entityId: 'app', data: value } }),
    ]);
    this.cached = undefined;
    return value;
  }
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Only what the store needs to show prices and hours. */
  @Public()
  @Get('public')
  async publicSettings() {
    const s = await this.settings.get();
    return {
      emergencyFeePoisha: s.emergencyFeePoisha,
      doctorBookingFeePoisha: s.doctorBookingFeePoisha,
      requireRxUpload: s.requireRxUpload,
      openHour: s.openHour,
      closeHour: s.closeHour,
      emergencyMinutes: s.emergencyMinutes,
    };
  }

  @RequirePermission('settings:manage')
  @Get()
  all() {
    return this.settings.get();
  }

  @RequirePermission('settings:manage')
  @Put()
  update(@Body(new ZodPipe(settingsSchema)) body: Settings, @CurrentUser() user: AuthUser) {
    return this.settings.update(body, user.id);
  }
}

@Module({ controllers: [SettingsController], providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
