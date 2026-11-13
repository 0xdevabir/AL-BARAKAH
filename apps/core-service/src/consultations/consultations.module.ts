import { Body, Controller, Get, Inject, Injectable, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  availabilitySchema, bookConsultationSchema, consultationRespondSchema, consultationStatusSchema, dailyMinutes, doctorDutySchema,
  doctorProfileSchema, doctorSchema, instantConsultSchema, SPECIALIST_DAILY_MINUTES, staffActiveSchema, staffSchema,
} from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import { consultationSlots, dhakaDayStart, RX_VALID_DAYS } from '@albarakah/domain';
import { Redis } from 'ioredis';
import type { z } from 'zod';
import { type AuthUser, CurrentUser, MailService, Public, RequirePermission, SessionService } from '@albarakah/nest-common';
import { badRequest, conflict, notFound, ZodPipe } from '@albarakah/nest-common';
import { PRISMA, REDIS } from '@albarakah/nest-common';
import { activeAdminIds, emailRx, notify, rxText } from '../notifications/notify.js';
import { shortCode } from '../orders/orders.service.js';
import { SettingsModule, SettingsService } from '../settings/settings.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DoctorOnboardingController } from './doctor-onboarding.controller.js';
import { readRx, rxCart } from './rx.js';

const HOLD_MS = 10 * 60_000;
const BOOKING_DAYS = 14;
/** An instant call is booked for this long once the intern picks it up. */
const INSTANT_MINUTES = 20;
/** An intern's "on duty" flag lapses on its own if they close the portal, like a rider's online flag. */
const DUTY_TTL = 30 * 60;
export const doctorDutyKey = (doctorId: string) => `doctor:duty:${doctorId}`;
/** In-app video room for instant calls. The consultation id is unguessable, so the room is private. */
export const videoRoom = (consultationId: string) => `https://meet.jit.si/barakabari-${consultationId}`;

@Injectable()
export class ConsultationsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly settings: SettingsService,
  ) {}

  /** Interns with the portal open and "on duty" switched on. */
  async onDutyInterns() {
    const interns = await this.prisma.doctor.findMany({
      where: { tier: 'INTERN', isActive: true, onboardedAt: { not: null }, user: { isActive: true } },
      select: { id: true, userId: true },
    });
    if (!interns.length) return [];
    const flags = await this.redis.mget(...interns.map((d) => doctorDutyKey(d.id))).catch(() => interns.map(() => null));
    return interns.filter((_, i) => !!flags[i]);
  }

  /** The on-duty intern with the fewest open instant calls, skipping anyone who already declined this one. */
  async pickIntern(exclude: string[] = []) {
    const onDuty = (await this.onDutyInterns()).filter((d) => !exclude.includes(d.id));
    if (!onDuty.length) return null;
    const load = await this.prisma.consultation.groupBy({
      by: ['doctorId'],
      where: { doctorId: { in: onDuty.map((d) => d.id) }, kind: 'INSTANT', status: { in: ['HOLD', 'CONFIRMED'] } },
      _count: { _all: true },
    });
    const busy = new Map(load.map((l) => [l.doctorId, l._count._all]));
    return onDuty.sort((a, b) => (busy.get(a.id) ?? 0) - (busy.get(b.id) ?? 0))[0]!;
  }

  /** A prepaid video call with the next free intern; it is paid for before it reaches their queue. */
  async instant(customerId: string, phone: string, input: z.output<typeof instantConsultSchema>, now = new Date()) {
    await this.releaseExpiredHolds();
    const open = await this.prisma.consultation.findFirst({
      where: { customerId, kind: 'INSTANT', OR: [{ status: 'HOLD' }, { status: 'CONFIRMED', endsAt: { gte: now } }, { status: 'CONFIRMED', acceptedAt: null }] },
      orderBy: { createdAt: 'desc' },
    });
    if (open) return open;
    const intern = await this.pickIntern();
    if (!intern) throw conflict('NO_DOCTOR_ON_DUTY', 'No doctor is on duty right now. Please try again in a few minutes, or book a specialist.');
    const s = await this.settings.get();
    return this.prisma.consultation.create({
      data: {
        code: shortCode('DC'), kind: 'INSTANT', channel: 'IN_APP', doctorId: intern.id, customerId,
        startsAt: now, endsAt: new Date(now.getTime() + INSTANT_MINUTES * 60_000),
        feePoisha: s.instantConsultFeePoisha, holdExpiresAt: new Date(now.getTime() + HOLD_MS),
        reason: input.reason, patientPhone: input.patientPhone ?? phone,
      },
    });
  }

  /**
   * A doctor takes or declines a paid consultation. A declined instant call moves to the next free intern;
   * with none left, or for a declined booked slot, it is cancelled and flagged for a refund.
   */
  async respond(doctorId: string, id: string, accept: boolean, actorId: string, reason?: string) {
    const c = await this.prisma.consultation.findFirst({ where: { id, doctorId, status: 'CONFIRMED', acceptedAt: null } });
    if (!c) throw conflict('NOT_PENDING', 'This consultation is not waiting for you any more');
    const now = new Date();
    if (accept) {
      const r = await this.prisma.consultation.updateMany({
        where: { id, doctorId, status: 'CONFIRMED', acceptedAt: null },
        // An instant call starts when it is picked up, so the patient gets the full time.
        data: c.kind === 'INSTANT'
          ? { acceptedAt: now, startsAt: now, endsAt: new Date(now.getTime() + INSTANT_MINUTES * 60_000) }
          : { acceptedAt: now },
      });
      if (r.count === 0) throw conflict('NOT_PENDING', 'This consultation is not waiting for you any more');
      await notify(this.prisma, [{
        userId: c.customerId, kind: 'consultation.accepted', link: `/doctors/bookings/${id}`,
        title: c.kind === 'INSTANT' ? 'Your doctor is ready — join the video call' : 'Your doctor confirmed your appointment',
      }]);
      return { ok: true, reassigned: false };
    }
    if (c.kind === 'INSTANT') {
      const next = await this.pickIntern([...c.rejectedBy, doctorId]);
      if (next) {
        const r = await this.prisma.consultation.updateMany({
          where: { id, doctorId, status: 'CONFIRMED', acceptedAt: null },
          data: { doctorId: next.id, rejectedBy: { push: doctorId }, startsAt: now, endsAt: new Date(now.getTime() + INSTANT_MINUTES * 60_000) },
        });
        if (r.count === 0) throw conflict('NOT_PENDING', 'This consultation is not waiting for you any more');
        await this.prisma.auditLog.create({ data: { actorId, action: 'consultation.reassign', entity: 'Consultation', entityId: id, data: { from: doctorId, to: next.id, reason } } });
        return { ok: true, reassigned: true };
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.consultation.updateMany({
        where: { id, doctorId, status: 'CONFIRMED', acceptedAt: null },
        data: { status: 'CANCELLED', rejectedBy: { push: doctorId }, notes: reason ? `Declined: ${reason}` : 'Declined by the doctor' },
      });
      if (r.count === 0) throw conflict('NOT_PENDING', 'This consultation is not waiting for you any more');
      await tx.auditLog.create({ data: { actorId, action: 'consultation.decline', entity: 'Consultation', entityId: id, data: { reason } } });
      // The patient paid up front, so an admin must refund them.
      await tx.auditLog.create({ data: { actorId, action: 'payment.needs_refund', entity: 'Consultation', entityId: id } });
    });
    await notify(this.prisma, [{
      userId: c.customerId, kind: 'consultation.declined', link: `/doctors/bookings/${id}`,
      title: 'Your consultation could not go ahead', body: 'No doctor could take it. Your payment will be refunded.',
    }]);
    return { ok: true, reassigned: false };
  }

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
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get('doctors')
  async doctors() {
    const rows = await this.prisma.doctor.findMany({
      where: { isActive: true, tier: 'SPECIALIST', onboardedAt: { not: null }, user: { isActive: true } },
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

  /** Whether a doctor can take a call right now, and what it costs. */
  @Public()
  @Get('consultations/instant/status')
  async instantStatus() {
    const [onDuty, s] = await Promise.all([this.service.onDutyInterns(), this.settings.get()]);
    return { available: onDuty.length > 0, doctorsOnDuty: onDuty.length, feePoisha: s.instantConsultFeePoisha, responseMinutes: s.instantResponseMinutes };
  }

  @RequirePermission('consultation:book')
  @Post('consultations/instant')
  async instant(@CurrentUser() u: AuthUser, @Body(new ZodPipe(instantConsultSchema)) body: z.output<typeof instantConsultSchema>) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    return this.service.instant(u.id, user.phone, body);
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
      select: { id: true, code: true, startsAt: true, endsAt: true, status: true, kind: true, acceptedAt: true, channel: true, feePoisha: true, doctor: { select: { specialty: true, user: { select: { name: true } } } } },
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
    // The video room opens only once the doctor has picked the call up.
    const videoLink = c.channel === 'IN_APP' && c.status === 'CONFIRMED' && c.acceptedAt ? videoRoom(c.id) : null;
    const s = await this.settings.get();
    const waitingSince = c.kind === 'INSTANT' && c.status === 'CONFIRMED' && !c.acceptedAt ? c.updatedAt : null;
    const { rejectedBy: _rejectedBy, ...pub } = c;
    const writtenAt = c.prescription ? (c.prescribedAt ?? c.updatedAt) : null;
    return {
      ...pub,
      videoLink,
      waitingSince,
      responseMinutes: s.instantResponseMinutes,
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
  async doctorMe(@CurrentUser() u: AuthUser) {
    const d = await this.doctorFor(u.id);
    const onDuty = d.tier === 'INTERN' ? !!(await this.redis.get(doctorDutyKey(d.id)).catch(() => null)) : false;
    return { ...d, onDuty };
  }

  /** Interns switch on to receive instant calls; the flag is refreshed while the portal is open. */
  @RequirePermission('doctor:work')
  @Put('doctor/duty')
  async setDuty(@CurrentUser() u: AuthUser, @Body(new ZodPipe(doctorDutySchema)) body: z.output<typeof doctorDutySchema>) {
    const d = await this.doctorFor(u.id);
    if (d.tier !== 'INTERN') throw badRequest('NOT_INTERN', 'Only duty doctors take instant calls');
    if (!d.onboardedAt) throw badRequest('PROFILE_INCOMPLETE', 'Finish your profile before going on duty');
    if (body.onDuty) await this.redis.set(doctorDutyKey(d.id), '1', 'EX', DUTY_TTL);
    else await this.redis.del(doctorDutyKey(d.id));
    return { onDuty: body.onDuty };
  }

  /** Paid consultations waiting for this doctor to accept or decline, oldest first. */
  @RequirePermission('doctor:work')
  @Get('doctor/queue')
  async doctorQueue(@CurrentUser() u: AuthUser) {
    const d = await this.doctorFor(u.id);
    return this.queueFor(d.id);
  }

  @RequirePermission('doctor:work')
  @Post('doctor/bookings/:id/respond')
  async doctorRespond(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(consultationRespondSchema)) body: z.output<typeof consultationRespondSchema>) {
    const d = await this.doctorFor(u.id);
    return this.service.respond(d.id, id, body.accept, u.id, body.reason);
  }

  private async queueFor(doctorId: string) {
    const s = await this.settings.get();
    const rows = await this.prisma.consultation.findMany({
      where: { doctorId, status: 'CONFIRMED', acceptedAt: null },
      orderBy: [{ kind: 'desc' }, { startsAt: 'asc' }],
      take: 50,
      select: {
        id: true, code: true, kind: true, startsAt: true, endsAt: true, channel: true, reason: true, patientPhone: true, updatedAt: true,
        customerId: true, customer: { select: { name: true } },
      },
    });
    const now = Date.now();
    return rows.map(({ updatedAt, ...r }) => ({
      ...r,
      waitingSince: updatedAt,
      // An instant call must be picked up within the promised minutes; past that it is flagged to admins too.
      overdue: r.kind === 'INSTANT' && now - updatedAt.getTime() > s.instantResponseMinutes * 60_000,
    }));
  }

  @RequirePermission('doctor:work')
  @Get('doctor/summary')
  async doctorSummary(@CurrentUser() u: AuthUser) {
    const d = await this.doctorFor(u.id);
    return this.summaryFor(d);
  }

  private async summaryFor(d: { id: string; availability: unknown[] }) {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [today, next, completedMonth, noShowMonth, patients, earned, pending] = await Promise.all([
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
      this.prisma.consultation.count({ where: { doctorId: d.id, status: 'CONFIRMED', acceptedAt: null } }),
    ]);
    return {
      today, next, completedMonth, noShowMonth, patients: patients.length, pending,
      earnedMonthPoisha: earned._sum.feePoisha ?? 0,
      hasAvailability: d.availability.length > 0,
    };
  }

  @RequirePermission('doctor:work')
  @Get('doctor/bookings')
  async doctorBookings(@CurrentUser() u: AuthUser, @Query('scope') scope?: string) {
    const d = await this.doctorFor(u.id);
    return this.bookingsFor(d.id, scope);
  }

  private bookingsFor(doctorId: string, scope?: string) {
    const d = { id: doctorId };
    const now = new Date();
    const past = scope === 'past';
    return this.prisma.consultation.findMany({
      where: past
        ? { doctorId: d.id, OR: [{ status: { in: ['COMPLETED', 'NO_SHOW'] } }, { status: 'CONFIRMED', endsAt: { lt: new Date(now.getTime() - 6 * 3_600_000) } }] }
        : { doctorId: d.id, status: 'CONFIRMED', acceptedAt: { not: null }, endsAt: { gte: new Date(now.getTime() - 6 * 3_600_000) } },
      orderBy: { startsAt: past ? 'desc' : 'asc' },
      take: 100,
      select: { id: true, code: true, kind: true, acceptedAt: true, startsAt: true, endsAt: true, status: true, channel: true, reason: true, patientPhone: true, notes: true, prescription: true, customerId: true, customer: { select: { name: true } } },
    }).then((rows) => rows.map((r) => ({ ...r, videoLink: r.channel === 'IN_APP' && r.status === 'CONFIRMED' ? videoRoom(r.id) : null })));
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
    const now = new Date();
    const r = await this.prisma.consultation.updateMany({
      where: { id, doctorId: d.id, status: 'CONFIRMED', startsAt: { lte: new Date(now.getTime() + 15 * 60_000) } },
      data: {
        status: body.status, notes: body.notes,
        ...(body.status === 'COMPLETED' && body.prescription ? { prescription: body.prescription, prescribedAt: now } : {}),
      },
    });
    if (r.count === 0) throw conflict('NOT_YET', 'This booking cannot be closed yet — it has not started, or it is already closed');
    // Closing the call means the doctor took it.
    await this.prisma.consultation.updateMany({ where: { id, acceptedAt: null }, data: { acceptedAt: now } });
    if (body.status === 'COMPLETED' && body.prescription) await this.distributeRx(id, d, body.prescription, now);
    return { ok: true };
  }

  /** A finished prescription goes to the patient, the doctor and the pharmacy's admins: inbox for all, email where known. */
  private async distributeRx(id: string, d: { userId: string; bmdcNo: string; user: { name: string } }, rx: NonNullable<z.output<typeof consultationStatusSchema>['prescription']>, at: Date) {
    const c = await this.prisma.consultation.findUniqueOrThrow({ where: { id }, select: { code: true, customerId: true, customer: { select: { name: true, email: true } } } });
    const admins = await activeAdminIds(this.prisma);
    const doctorEmail = (await this.prisma.user.findUnique({ where: { id: d.userId }, select: { email: true } }))?.email;
    const title = `Prescription ${c.code}`;
    const body = `${d.user.name} → ${c.customer.name || 'patient'} · ${rx.items.length} medicine${rx.items.length === 1 ? '' : 's'}`;
    await notify(this.prisma, [
      { userId: c.customerId, kind: 'rx.issued', title: 'Your prescription is ready', body: `From ${d.user.name}. You can order the medicines straight from it.`, link: `/doctors/bookings/${id}` },
      { userId: d.userId, kind: 'rx.copy', title, body, link: `/doctor/bookings?id=${id}` },
      ...admins.map((a) => ({ userId: a.id, kind: 'rx.copy', title, body, link: `/admin/prescriptions?id=${id}` })),
    ]);
    const text = rxText(rx, { code: c.code, patient: c.customer.name || 'Patient', doctor: d.user.name, bmdcNo: d.bmdcNo, at });
    await emailRx(this.mail, [c.customer.email ?? '', doctorEmail ?? '', ...admins.map((a) => a.email ?? '')], `BarakaBari ${title}`, text);
  }

  @RequirePermission('doctor:work')
  @Put('doctor/availability')
  async setAvailability(@CurrentUser() u: AuthUser, @Body(new ZodPipe(availabilitySchema)) body: z.output<typeof availabilitySchema>) {
    const d = await this.doctorFor(u.id);
    // Specialists keep a 2-4 hour block for patients on each day they consult; duty interns are on call instead.
    if (d.tier === 'SPECIALIST') {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (const [weekday, mins] of dailyMinutes(body.windows)) {
        if (mins < SPECIALIST_DAILY_MINUTES.min || mins > SPECIALIST_DAILY_MINUTES.max) {
          throw badRequest('DAILY_HOURS', `${days[weekday]}: keep between 2 and 4 hours a day for patients (now ${Math.round((mins / 60) * 10) / 10} h)`);
        }
      }
    }
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

  /** How many doctors a patient could see now: interns on duty, specialists consulting today. */
  @RequirePermission('consultation:manage')
  @Get('admin/doctors/available')
  async availableDoctors() {
    const now = new Date();
    const weekday = new Date(dhakaDayStart(now) + 6 * 3_600_000).getUTCDay();
    const [interns, specialists, overdue] = await Promise.all([
      this.service.onDutyInterns(),
      this.prisma.doctor.findMany({
        where: { tier: 'SPECIALIST', isActive: true, onboardedAt: { not: null }, user: { isActive: true }, availability: { some: { weekday } } },
        select: { id: true, specialty: true, user: { select: { name: true } } },
      }),
      this.overdueInstant(),
    ]);
    return { onDutyInterns: interns.length, specialistsToday: specialists.length, total: interns.length + specialists.length, specialists, overdueInstant: overdue };
  }

  private async overdueInstant() {
    const s = await this.settings.get();
    return this.prisma.consultation.findMany({
      where: { kind: 'INSTANT', status: 'CONFIRMED', acceptedAt: null, updatedAt: { lt: new Date(Date.now() - s.instantResponseMinutes * 60_000) } },
      select: { id: true, code: true, updatedAt: true, doctor: { select: { user: { select: { name: true } } } } },
      take: 50,
    });
  }

  /** Admins see a doctor's portal exactly as the doctor does, read-only. */
  @RequirePermission('consultation:manage')
  @Get('admin/doctors/:id/portal')
  async doctorPortal(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('scope') scope?: string) {
    const d = await this.prisma.doctor.findUnique({ where: { id }, include: { availability: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] }, user: { select: { name: true, phone: true } } } });
    if (!d) throw notFound('Doctor not found');
    // Patient details and prescriptions are health data: every view is recorded.
    await this.prisma.auditLog.create({ data: { actorId: u.id, action: 'doctor.portal.view', entity: 'Doctor', entityId: id } });
    const [summary, queue, bookings, onDuty] = await Promise.all([
      this.summaryFor(d), this.queueFor(d.id), this.bookingsFor(d.id, scope),
      d.tier === 'INTERN' ? this.redis.get(doctorDutyKey(d.id)).catch(() => null) : null,
    ]);
    return { doctor: { ...d, onDuty: !!onDuty }, summary, queue, bookings };
  }

  /** Every prescription written, newest first, for the pharmacy's copy. */
  @RequirePermission('prescription:read')
  @Get('admin/prescriptions')
  async adminPrescriptions(@CurrentUser() actor: AuthUser, @Query('page') page?: string) {
    const p = Math.max(0, Number(page) || 0);
    // Prescriptions are health records: every look is recorded, like prescription photo views.
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'prescription.list.view', entity: 'Consultation', data: { page: p } } });
    return this.prisma.consultation.findMany({
      where: { status: 'COMPLETED', prescribedAt: { not: null } },
      orderBy: { prescribedAt: 'desc' },
      skip: p * 50,
      take: 50,
      select: {
        id: true, code: true, kind: true, prescribedAt: true, startsAt: true, prescription: true, patientPhone: true,
        customer: { select: { name: true } }, doctor: { select: { bmdcNo: true, specialty: true, user: { select: { name: true } } } },
      },
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
        id: true, code: true, startsAt: true, status: true, kind: true, acceptedAt: true, channel: true, feePoisha: true,
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
