import { Body, Controller, Get, Inject, Injectable, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { availabilitySchema, bookConsultationSchema, consultationStatusSchema, doctorProfileSchema, doctorSchema, staffActiveSchema, staffSchema } from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import { consultationSlots, RX_VALID_DAYS } from '@albarakah/domain';
import type { z } from 'zod';
import { type AuthUser, CurrentUser, MailService, Public, RequirePermission, SessionService } from '@albarakah/nest-common';
import { badRequest, conflict, notFound, ZodPipe } from '@albarakah/nest-common';
import { PRISMA } from '@albarakah/nest-common';
import { shortCode } from '../orders/orders.service.js';
import { SettingsModule, SettingsService } from '../settings/settings.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DoctorOnboardingController } from './doctor-onboarding.controller.js';
import { readRx, rxCart } from './rx.js';

const HOLD_MS = 10 * 60_000;
const BOOKING_DAYS = 14;

@Injectable()
export class ConsultationsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient, private readonly settings: SettingsService) {}

  /** Lapsed holds are released here as well as by the worker, so a slot frees up on time even if the worker lags. */
  releaseExpiredHolds(doctorId?: string) {
    return this.prisma.consultation.updateMany({
      where: { status: 'HOLD', holdExpiresAt: { lt: new Date() }, ...(doctorId ? { doctorId } : {}) },
      data: { status: 'CANCELLED' },
    });
  }

  async slots(doctorId: string, now = new Date()) {
    await this.releaseExpiredHolds(doctorId);
    const doctor = await this.prisma.doctor.findFirst({ where: { id: doctorId, isActive: true, onboardedAt: { not: null } }, include: { availability: true } });
    if (!doctor) throw notFound('Doctor not found');
    const taken = await this.prisma.consultation.findMany({
      where: { doctorId, startsAt: { gte: now }, status: { in: ['HOLD', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'] } },
      select: { startsAt: true },
    });
    return consultationSlots(doctor.availability, now, BOOKING_DAYS, taken.map((t) => t.startsAt));
  }

  async book(customerId: string, phone: string, input: z.output<typeof bookConsultationSchema>, now = new Date()) {
    const startsAt = new Date(input.startsAt);
    const slots = await this.slots(input.doctorId, now);
    const slot = slots.find((s) => s.start.getTime() === startsAt.getTime());
    if (!slot) throw conflict('SLOT_TAKEN', 'That time was just taken. Please choose another.');
    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: input.doctorId } });
    if (!doctor.channels.includes(input.channel)) throw badRequest('CHANNEL_UNAVAILABLE', 'This doctor does not offer that call type');
    const s = await this.settings.get();
    try {
      return await this.prisma.consultation.create({
        data: {
          code: shortCode('DC'), doctorId: doctor.id, customerId, startsAt: slot.start, endsAt: slot.end, channel: input.channel,
          feePoisha: doctor.feePoisha ?? s.doctorBookingFeePoisha, holdExpiresAt: new Date(now.getTime() + HOLD_MS),
          reason: input.reason, patientPhone: input.patientPhone ?? phone,
        },
      });
    } catch (err) {
      // The partial unique index is the final word when two people book the same slot at once.
      if ((err as { code?: string }).code === 'P2002' || String(err).includes('Consultation_active_slot_key')) {
        throw conflict('SLOT_TAKEN', 'That time was just taken. Please choose another.');
      }
      throw err;
    }
  }
}

@Controller()
export class ConsultationsController {
  constructor(
    private readonly service: ConsultationsService,
    private readonly sessions: SessionService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  @Public()
  @Get('doctors')
  async doctors() {
    const rows = await this.prisma.doctor.findMany({
      where: { isActive: true, onboardedAt: { not: null }, user: { isActive: true } },
      select: {
        id: true, specialty: true, bio: true, bmdcNo: true, feePoisha: true, channels: true,
        photoUrl: true, qualifications: true, experienceYears: true, workplace: true, languages: true, onboardedAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    // "Next free" lets patients pick the soonest doctor without opening each one.
    const now = new Date();
    const next = await Promise.all(rows.map((d) => this.service.slots(d.id, now).catch(() => [])));
    const completed = await this.prisma.consultation.groupBy({ by: ['doctorId'], where: { status: 'COMPLETED' }, _count: { _all: true } });
    const seen = new Map(completed.map((c) => [c.doctorId, c._count._all]));
    return rows.map(({ user, ...d }, i) => ({
      ...d,
      name: user.name,
      nextSlot: next[i]?.[0] ?? null,
      openSlots: next[i]?.length ?? 0,
      consultations: seen.get(d.id) ?? 0,
    }));
  }

  @Public()
  @Get('doctors/:id/slots')
  slots(@Param('id') id: string) {
    return this.service.slots(id);
  }

  @RequirePermission('consultation:book')
  @Post('consultations')
  async book(@CurrentUser() u: AuthUser, @Body(new ZodPipe(bookConsultationSchema)) body: z.output<typeof bookConsultationSchema>) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    return this.service.book(u.id, user.phone, body);
  }

  @RequirePermission('consultation:book')
  @Get('consultations')
  mine(@CurrentUser() u: AuthUser) {
    return this.prisma.consultation.findMany({
      where: { customerId: u.id, status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'desc' },
      take: 50,
      select: { id: true, code: true, startsAt: true, endsAt: true, status: true, channel: true, feePoisha: true, doctor: { select: { specialty: true, user: { select: { name: true } } } } },
    });
  }

  @RequirePermission('consultation:book')
  @Get('consultations/:id')
  async mineOne(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.consultation.findFirst({
      where: { id, customerId: u.id },
      include: {
        doctor: { select: { specialty: true, meetLink: true, whatsapp: true, bmdcNo: true, qualifications: true, workplace: true, user: { select: { name: true } } } },
        orders: { select: { id: true, code: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!c) throw notFound('Booking not found');
    // The call details are only revealed once the booking has been paid for.
    const paid = ['CONFIRMED', 'COMPLETED'].includes(c.status);
    const writtenAt = c.prescription ? (c.prescribedAt ?? c.updatedAt) : null;
    return {
      ...c,
      rxValidUntil: writtenAt && c.status === 'COMPLETED' ? new Date(writtenAt.getTime() + RX_VALID_DAYS * 86_400_000) : null,
      doctor: {
        name: c.doctor.user.name,
        specialty: c.doctor.specialty,
        bmdcNo: c.doctor.bmdcNo,
        qualifications: c.doctor.qualifications,
        workplace: c.doctor.workplace,
        meetLink: paid && c.channel === 'GOOGLE_MEET' ? c.doctor.meetLink : null,
        whatsapp: paid && c.channel === 'WHATSAPP' ? c.doctor.whatsapp : null,
      },
    };
  }

  /** The prescription as ready-to-add cart lines: matched catalogue medicine, course quantity, stock. */
  @RequirePermission('consultation:book')
  @Get('consultations/:id/rx-cart')
  async rxCartFor(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.consultation.findFirst({ where: { id, customerId: u.id, status: 'COMPLETED' }, select: { prescription: true } });
    const rx = readRx(c?.prescription);
    if (!rx) throw notFound('No prescription on this consultation');
    return { items: await rxCart(this.prisma, rx) };
  }

  // ---- doctor portal: only their own bookings ----
  private async doctorFor(userId: string) {
    const d = await this.prisma.doctor.findUnique({ where: { userId }, include: { availability: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] }, user: { select: { name: true, phone: true } } } });
    if (!d) throw notFound('Doctor profile not found');
    return d;
  }

  @RequirePermission('doctor:work')
  @Get('doctor/me')
  doctorMe(@CurrentUser() u: AuthUser) {
    return this.doctorFor(u.id);
  }

  @RequirePermission('doctor:work')
  @Get('doctor/summary')
  async doctorSummary(@CurrentUser() u: AuthUser) {
    const d = await this.doctorFor(u.id);
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [today, next, completedMonth, noShowMonth, patients, earned] = await Promise.all([
      this.prisma.consultation.count({ where: { doctorId: d.id, status: { in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] }, startsAt: { gte: dayStart, lt: dayEnd } } }),
      this.prisma.consultation.findFirst({
        where: { doctorId: d.id, status: 'CONFIRMED', endsAt: { gte: now } },
        orderBy: { startsAt: 'asc' },
        select: { id: true, code: true, startsAt: true, endsAt: true, channel: true, reason: true, patientPhone: true, customerId: true, customer: { select: { name: true } } },
      }),
      this.prisma.consultation.count({ where: { doctorId: d.id, status: 'COMPLETED', startsAt: { gte: monthStart } } }),
      this.prisma.consultation.count({ where: { doctorId: d.id, status: 'NO_SHOW', startsAt: { gte: monthStart } } }),
      this.prisma.consultation.groupBy({ by: ['customerId'], where: { doctorId: d.id, status: 'COMPLETED' } }),
      this.prisma.consultation.aggregate({ where: { doctorId: d.id, status: 'COMPLETED', startsAt: { gte: monthStart } }, _sum: { feePoisha: true } }),
    ]);
    return {
      today, next, completedMonth, noShowMonth, patients: patients.length,
      earnedMonthPoisha: earned._sum.feePoisha ?? 0,
      hasAvailability: d.availability.length > 0,
    };
  }

  @RequirePermission('doctor:work')
  @Get('doctor/bookings')
  async doctorBookings(@CurrentUser() u: AuthUser, @Query('scope') scope?: string) {
    const d = await this.doctorFor(u.id);
    const now = new Date();
    const past = scope === 'past';
    return this.prisma.consultation.findMany({
      where: past
        ? { doctorId: d.id, OR: [{ status: { in: ['COMPLETED', 'NO_SHOW'] } }, { status: 'CONFIRMED', endsAt: { lt: new Date(now.getTime() - 6 * 3_600_000) } }] }
        : { doctorId: d.id, status: 'CONFIRMED', endsAt: { gte: new Date(now.getTime() - 6 * 3_600_000) } },
      orderBy: { startsAt: past ? 'desc' : 'asc' },
      take: 100,
      select: { id: true, code: true, startsAt: true, endsAt: true, status: true, channel: true, reason: true, patientPhone: true, notes: true, prescription: true, customerId: true, customer: { select: { name: true } } },
    });
  }

  /** A doctor may only see the history of a patient who has booked them. */
  @RequirePermission('doctor:work')
  @Get('doctor/patients/:customerId')
  async patientHistory(@CurrentUser() u: AuthUser, @Param('customerId') customerId: string) {
    const d = await this.doctorFor(u.id);
    const visits = await this.prisma.consultation.findMany({
      where: { doctorId: d.id, customerId, status: { in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] } },
      orderBy: { startsAt: 'desc' },
      take: 50,
      select: { id: true, code: true, startsAt: true, status: true, channel: true, reason: true, notes: true, prescription: true, patientPhone: true },
    });
    if (!visits.length) throw notFound('Patient not found');
    const patient = await this.prisma.user.findUnique({ where: { id: customerId }, select: { name: true, createdAt: true } });
    return { patient: { id: customerId, name: patient?.name ?? '', phone: visits[0]!.patientPhone, since: patient?.createdAt }, visits };
  }

  @RequirePermission('doctor:work')
  @Patch('doctor/bookings/:id')
  async doctorUpdate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(consultationStatusSchema)) body: z.output<typeof consultationStatusSchema>) {
    const d = await this.doctorFor(u.id);
    const r = await this.prisma.consultation.updateMany({
      where: { id, doctorId: d.id, status: 'CONFIRMED', startsAt: { lte: new Date(Date.now() + 15 * 60_000) } },
      data: { status: body.status, notes: body.notes, ...(body.status === 'COMPLETED' && body.prescription ? { prescription: body.prescription, prescribedAt: new Date() } : {}) },
    });
    if (r.count === 0) throw conflict('NOT_YET', 'This booking cannot be closed yet — it has not started, or it is already closed');
    return { ok: true };
  }

  @RequirePermission('doctor:work')
  @Put('doctor/availability')
  async setAvailability(@CurrentUser() u: AuthUser, @Body(new ZodPipe(availabilitySchema)) body: z.output<typeof availabilitySchema>) {
    const d = await this.doctorFor(u.id);
    const byDay = new Map<number, { s: number; e: number }[]>();
    for (const w of body.windows) {
      const list = byDay.get(w.weekday) ?? [];
      if (list.some((x) => w.startMinute < x.e && x.s < w.endMinute)) throw badRequest('OVERLAP', 'Two of your hours overlap on the same day');
      list.push({ s: w.startMinute, e: w.endMinute });
      byDay.set(w.weekday, list);
    }
    await this.prisma.$transaction([
      this.prisma.availability.deleteMany({ where: { doctorId: d.id } }),
      this.prisma.availability.createMany({ data: body.windows.map((w) => ({ ...w, doctorId: d.id })) }),
    ]);
    return { ok: true };
  }

  @RequirePermission('doctor:work')
  @Put('doctor/profile')
  async setProfile(@CurrentUser() u: AuthUser, @Body(new ZodPipe(doctorProfileSchema)) body: z.output<typeof doctorProfileSchema>) {
    const d = await this.doctorFor(u.id);
    if (d.onboardedAt && d.channels.includes('GOOGLE_MEET') && !body.meetLink) throw badRequest('MEET_REQUIRED', 'You take Google Meet calls, so add a Meet link');
    if (d.onboardedAt && d.channels.includes('WHATSAPP') && !body.whatsapp) throw badRequest('WHATSAPP_REQUIRED', 'You take WhatsApp calls, so add a WhatsApp number');
    // Once live, a doctor must keep the basics a patient chooses by.
    if (d.onboardedAt && body.qualifications !== undefined && !body.qualifications) throw badRequest('QUALIFICATIONS_REQUIRED', 'Patients need to see your qualifications');
    const languages = body.languages ? [...new Set(body.languages)] : undefined;
    await this.prisma.$transaction([
      this.prisma.doctor.update({
        where: { id: d.id },
        data: {
          bio: body.bio, meetLink: body.meetLink || null, whatsapp: body.whatsapp || null,
          ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl } : {}),
          ...(body.qualifications !== undefined ? { qualifications: body.qualifications } : {}),
          ...(body.experienceYears !== undefined ? { experienceYears: body.experienceYears } : {}),
          ...(body.workplace !== undefined ? { workplace: body.workplace } : {}),
          ...(languages ? { languages } : {}),
        },
      }),
      ...(body.name ? [this.prisma.user.update({ where: { id: u.id }, data: { name: body.name } })] : []),
    ]);
    return { ok: true };
  }

  // ---- admin: onboarding and staff ----
  @RequirePermission('staff:manage')
  @Get('admin/doctors')
  adminDoctors() {
    return this.prisma.doctor.findMany({
      include: {
        user: { select: { name: true, phone: true, email: true, isActive: true } },
        availability: { select: { id: true } },
        _count: { select: { consultations: { where: { status: 'COMPLETED' } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @RequirePermission('staff:manage')
  @Patch('admin/doctors/:id/active')
  async setDoctorActive(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(staffActiveSchema)) body: z.output<typeof staffActiveSchema>) {
    const r = await this.prisma.doctor.updateMany({ where: { id }, data: { isActive: body.isActive } });
    if (r.count === 0) throw notFound('Doctor not found');
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'doctor.active', entity: 'Doctor', entityId: id, data: { isActive: body.isActive } } });
    return { ok: true };
  }
  @RequirePermission('staff:manage')
  @Post('admin/doctors')
  async onboard(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(doctorSchema)) body: z.output<typeof doctorSchema>) {
    const existing = await this.prisma.user.findUnique({ where: { phone: body.phone } });
    if (existing && existing.role !== 'CUSTOMER') throw conflict('PHONE_IN_USE', 'This phone number already belongs to a staff account');
    if (await this.prisma.doctor.findUnique({ where: { bmdcNo: body.bmdcNo } })) throw conflict('BMDC_IN_USE', 'This BMDC number is already registered');
    const { phone, name, ...profile } = body;
    const doctor = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { phone }, update: { role: 'DOCTOR', name }, create: { phone, name, role: 'DOCTOR' } });
      const d = await tx.doctor.create({ data: { ...profile, userId: user.id, onboardedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'doctor.onboard', entity: 'Doctor', entityId: d.id } });
      return d;
    });
    // Any session from before the role change carries the old role, so it must go.
    await this.sessions.revokeAllForUser(doctor.userId);
    return doctor;
  }

  @RequirePermission('staff:manage')
  @Get('admin/staff')
  staff(@Query('role') role?: string) {
    const roles = role === 'RIDER' || role === 'ADMIN' || role === 'DOCTOR' ? [role] : ['RIDER', 'ADMIN', 'DOCTOR'];
    return this.prisma.user.findMany({
      where: { role: { in: roles as ('RIDER' | 'ADMIN' | 'DOCTOR')[] } }, orderBy: { name: 'asc' },
      select: { id: true, phone: true, name: true, role: true, isActive: true, totpEnabled: true },
    });
  }

  @RequirePermission('staff:manage')
  @Post('admin/staff')
  async addStaff(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(staffSchema)) body: z.output<typeof staffSchema>) {
    const existing = await this.prisma.user.findUnique({ where: { phone: body.phone } });
    if (existing && existing.role !== 'CUSTOMER') throw conflict('PHONE_IN_USE', 'This phone number already belongs to a staff account');
    const user = await this.prisma.user.upsert({ where: { phone: body.phone }, update: { role: body.role, name: body.name }, create: body });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'staff.add', entity: 'User', entityId: user.id, data: { role: body.role } } });
    await this.sessions.revokeAllForUser(user.id);
    return { id: user.id, phone: user.phone, name: user.name, role: user.role };
  }

  @RequirePermission('staff:manage')
  @Patch('admin/staff/:id/active')
  async setActive(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { isActive?: unknown }) {
    if (id === actor.id) throw badRequest('SELF_DISABLE', 'You cannot disable your own account');
    if (typeof body.isActive !== 'boolean') throw badRequest('VALIDATION', 'isActive must be true or false');
    const r = await this.prisma.user.updateMany({ where: { id, role: { not: 'CUSTOMER' } }, data: { isActive: body.isActive } });
    if (r.count === 0) throw notFound('Staff member not found');
    if (!body.isActive) await this.sessions.revokeAllForUser(id);
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'staff.active', entity: 'User', entityId: id, data: { isActive: body.isActive } } });
    return { ok: true };
  }

  @RequirePermission('consultation:manage')
  @Get('admin/consultations')
  adminConsultations() {
    return this.prisma.consultation.findMany({
      where: { status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'desc' },
      take: 100,
      select: {
        id: true, code: true, startsAt: true, status: true, channel: true, feePoisha: true,
        customer: { select: { name: true, phone: true } }, doctor: { select: { user: { select: { name: true } } } },
        payments: { where: { status: { in: ['PAID', 'REFUNDED'] } }, select: { id: true, status: true, trxId: true } },
      },
    });
  }
}

@Module({
  imports: [SettingsModule, StorageModule],
  controllers: [ConsultationsController, DoctorOnboardingController],
  providers: [ConsultationsService, MailService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
