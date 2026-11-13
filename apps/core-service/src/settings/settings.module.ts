import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Body, Controller, Get, Inject, Injectable, Module, Put } from '@nestjs/common';
import { type Settings, settingsSchema } from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import { DEFAULT_FEES, DEFAULT_SCHEDULE } from '@albarakah/domain';
import { type AuthUser, CurrentUser, Public, RequirePermission } from '@albarakah/nest-common';
import { type Env, ENV } from '@albarakah/nest-common';
import { ZodPipe } from '@albarakah/nest-common';
import { PRISMA } from '@albarakah/nest-common';

const DEFAULTS: Settings = {
  ...DEFAULT_FEES,
  ...DEFAULT_SCHEDULE,
  requireRxUpload: false,
  androidLatestVersionCode: 0,
  androidLatestVersionName: '',
  androidApkUrl: '',
  androidForceUpdate: false,
  androidUpdateNotes: '',
  pharmacyLat: 23.7808,
  pharmacyLng: 90.4067,
  pharmacyAddress: '',
  hotlines: [],
  instantConsultFeePoisha: 30000,
  instantResponseMinutes: 10,
  doctorCommissionPct: 20,
};
const CACHE_MS = 15_000;
const RELEASE_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../android-release.json');

/** Written by apps/store/scripts/ship-apk.mjs after each APK build. Only version + URL — force/notes stay admin-owned. */
function releaseOverlay(): Partial<Settings> {
  if (!existsSync(RELEASE_FILE)) return {};
  try {
    const raw = JSON.parse(readFileSync(RELEASE_FILE, 'utf8')) as Partial<Settings>;
    return {
      ...(typeof raw.androidLatestVersionCode === 'number' ? { androidLatestVersionCode: raw.androidLatestVersionCode } : {}),
      ...(typeof raw.androidLatestVersionName === 'string' ? { androidLatestVersionName: raw.androidLatestVersionName } : {}),
      ...(typeof raw.androidApkUrl === 'string' && raw.androidApkUrl ? { androidApkUrl: raw.androidApkUrl } : {}),
    };
  } catch {
    return {};
  }
}

@Injectable()
export class SettingsService {
  private cached?: { value: Settings; at: number };

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async get(): Promise<Settings> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const row = await this.prisma.setting.findUnique({ where: { key: 'app' } });
    const value = { ...DEFAULTS, ...(row?.value as Partial<Settings> | null), ...releaseOverlay() };
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
  constructor(
    private readonly settings: SettingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Only what the store needs to show prices, hours, and app updates. */
  @Public()
  @Get('public')
  async publicSettings() {
    const s = await this.settings.get();
    const store = this.env.STORE_URL.replace(/\/$/, '');
    return {
      emergencyFeePoisha: s.emergencyFeePoisha,
      doctorBookingFeePoisha: s.doctorBookingFeePoisha,
      instantConsultFeePoisha: s.instantConsultFeePoisha,
      instantResponseMinutes: s.instantResponseMinutes,
      hotlines: s.hotlines,
      requireRxUpload: s.requireRxUpload,
      openHour: s.openHour,
      closeHour: s.closeHour,
      emergencyMinutes: s.emergencyMinutes,
      androidLatestVersionCode: s.androidLatestVersionCode,
      androidLatestVersionName: s.androidLatestVersionName,
      androidApkUrl: s.androidApkUrl || `${store}/download/barakabari.apk`,
      androidForceUpdate: s.androidForceUpdate,
      androidUpdateNotes: s.androidUpdateNotes,
      pharmacy: { lat: s.pharmacyLat, lng: s.pharmacyLng, address: s.pharmacyAddress },
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
