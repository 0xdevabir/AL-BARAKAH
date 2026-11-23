import { Body, Controller, Get, Inject, Module, Param, Post, Put } from '@nestjs/common';
import {
  consultationCancelSchema, consultationFileConfirmSchema, consultationFileUploadSchema, consultationRateSchema,
  consultationRescheduleSchema, healthProfileSchema,
} from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import { type AuthUser, badRequest, conflict, CurrentUser, notFound, PRISMA, RequirePermission, ZodPipe } from '@albarakah/nest-common';
import type { z } from 'zod';
import { activeAdminIds, notify } from '../notifications/notify.js';
import { SettingsModule, SettingsService } from '../settings/settings.module.js';
import { StorageModule, StorageService } from '../storage/storage.module.js';
import { ConsultationsModule, ConsultationsService } from './consultations.module.js';

/** A booking can be moved this many times; after that the patient cancels and books afresh. */
export const MAX_RESCHEDULES = 2;
/** Enough for a few reports and photos without turning a booking into file storage. */
const MAX_FILES = 10;
const fmt = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });

const EMPTY_HEALTH = { dateOfBirth: null, sex: '', weightKg: null, bloodGroup: '', allergies: '', conditions: '', medications: '', updatedAt: null };

/**
 * The patient's side of e-medicine around a booking: health profile, cancel, reschedule, reports, rating,
 * plus what a doctor may read of it. Booking and the call itself live in ConsultationsController.
 */
@Controller()
export class CareController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly consultations: ConsultationsService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  // ---- Health profile -------------------------------------------------------------------------

  @RequirePermission('consultation:book')
  @Get('me/health')
  async health(@CurrentUser() u: AuthUser) {
    return (await this.prisma.patientProfile.findUnique({ where: { userId: u.id } })) ?? { userId: u.id, ...EMPTY_HEALTH };
  }

  @RequirePermission('consultation:book')
  @Put('me/health')
  setHealth(@CurrentUser() u: AuthUser, @Body(new ZodPipe(healthProfileSchema)) body: z.output<typeof healthProfileSchema>) {
    const dob = body.dateOfBirth ? new Date(`${body.dateOfBirth}T00:00:00Z`) : null;
    if (dob && dob.getTime() > Date.now()) throw badRequest('INVALID_DOB', 'Date of birth cannot be in the future');
    const data = { ...body, dateOfBirth: dob };
    return this.prisma.patientProfile.upsert({ where: { userId: u.id }, create: { userId: u.id, ...data }, update: data });
  }

  // ---- Cancel and reschedule ------------------------------------------------------------------

  private async ownBooking(customerId: string, id: string) {
    const c = await this.prisma.consultation.findFirst({
      where: { id, customerId },
      include: { doctor: { select: { userId: true, user: { select: { name: true } } } }, payments: { where: { status: 'PAID' }, select: { id: true } } },
    });
    if (!c) throw notFound('Booking not found');
    return c;
  }

  /** Whether the patient can still call it off or move it, and why not. Shared with the booking page. */
  private async changeWindow(c: { status: string; kind: string; acceptedAt: Date | null; startsAt: Date }, now = new Date()) {
    if (c.status === 'HOLD') return { ok: true as const };
    if (c.status !== 'CONFIRMED') return { ok: false as const, reason: 'This booking is already closed.' };
    if (c.kind === 'INSTANT') {
      return c.acceptedAt ? { ok: false as const, reason: 'The doctor has already picked up this call.' } : { ok: true as const };
    }
    const { consultCancelHours } = await this.settings.get();
    if (c.startsAt.getTime() - now.getTime() < consultCancelHours * 3_600_000) {
      return { ok: false as const, reason: `Changes close ${consultCancelHours} hour${consultCancelHours === 1 ? '' : 's'} before the call. Please contact us.` };
    }
    return { ok: true as const };
  }

  @RequirePermission('consultation:book')
  @Get('consultations/:id/options')
  async options(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const c = await this.ownBooking(u.id, id);
    const w = await this.changeWindow(c);
    return {
      canCancel: w.ok,
      canReschedule: w.ok && c.kind === 'SCHEDULED' && c.rescheduledCount < MAX_RESCHEDULES,
      reschedulesLeft: c.kind === 'SCHEDULED' ? Math.max(0, MAX_RESCHEDULES - c.rescheduledCount) : 0,
      canRate: c.status === 'COMPLETED' && !c.ratedAt,
      reason: w.ok ? null : w.reason,
      paid: c.payments.length > 0,
    };
  }

  @RequirePermission('consultation:book')
  @Post('consultations/:id/cancel')
  async cancel(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(consultationCancelSchema)) body: z.output<typeof consultationCancelSchema>) {
    const c = await this.ownBooking(u.id, id);
    const w = await this.changeWindow(c);
    if (!w.ok) throw conflict('TOO_LATE', w.reason);
    const paid = c.payments[0];
    await this.prisma.$transaction(async (tx) => {
      // The status guard makes a double tap, or a doctor accepting at the same moment, a no-op.
      const r = await tx.consultation.updateMany({
        where: { id, status: c.status, ...(c.kind === 'INSTANT' && c.status === 'CONFIRMED' ? { acceptedAt: null } : {}) },
        data: { status: 'CANCELLED', cancelledBy: 'PATIENT', cancelReason: body.reason ?? null, holdExpiresAt: null },
      });
      if (r.count === 0) throw conflict('TOO_LATE', 'This booking just changed. Please refresh.');
      if (paid) {
        await tx.auditLog.create({ data: { actorId: u.id, action: 'payment.needs_refund', entity: 'Payment', entityId: paid.id, data: { consultationId: id, reason: 'patient_cancelled' } } });
      }
    });
    if (c.status === 'CONFIRMED') {
      const admins = paid ? await activeAdminIds(this.prisma) : [];
      await notify(this.prisma, [
        { userId: c.doctor.userId, kind: 'consult.cancelled', title: `Booking ${c.code} cancelled`, body: `The patient cancelled the ${fmt(c.startsAt)} call.`, link: `/doctor/bookings` },
        ...admins.map((a) => ({ userId: a.id, kind: 'consult.refund', title: `Refund due: ${c.code}`, body: 'The patient cancelled a paid consultation in time.', link: `/admin/consultations?id=${id}` })),
      ]);
    }
    return { ok: true, refundDue: !!paid };
  }

  @RequirePermission('consultation:book')
  @Post('consultations/:id/reschedule')
  async reschedule(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(consultationRescheduleSchema)) body: z.output<typeof consultationRescheduleSchema>) {
    const c = await this.ownBooking(u.id, id);
    if (c.kind !== 'SCHEDULED') throw badRequest('NOT_RESCHEDULABLE', 'Instant calls cannot be moved');
    if (c.rescheduledCount >= MAX_RESCHEDULES) throw conflict('RESCHEDULE_LIMIT', `A booking can be moved ${MAX_RESCHEDULES} times. Please cancel and book again.`);
    const w = await this.changeWindow(c);
    if (!w.ok) throw conflict('TOO_LATE', w.reason);
    const startsAt = new Date(body.startsAt);
    const slot = (await this.consultations.slots(c.doctorId)).find((s) => s.start.getTime() === startsAt.getTime());
    if (!slot) throw conflict('SLOT_TAKEN', 'That time is not free. Please choose another.');
    try {
      const r = await this.prisma.consultation.updateMany({
        where: { id, status: c.status, startsAt: c.startsAt, rescheduledCount: c.rescheduledCount },
        data: { startsAt: slot.start, endsAt: slot.end, rescheduledCount: { increment: 1 } },
      });
      if (r.count === 0) throw conflict('TOO_LATE', 'This booking just changed. Please refresh.');
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002' || String(err).includes('Consultation_active_slot_key')) {
        throw conflict('SLOT_TAKEN', 'That time was just taken. Please choose another.');
      }
      throw err;
    }
    if (c.status === 'CONFIRMED') {
      await notify(this.prisma, [{
        userId: c.doctor.userId, kind: 'consult.rescheduled', title: `Booking ${c.code} moved`,
        body: `From ${fmt(c.startsAt)} to ${fmt(slot.start)}.`, link: `/doctor/bookings`,
      }]);
    }
    return { ok: true, startsAt: slot.start, endsAt: slot.end };
  }

  // ---- Rating ---------------------------------------------------------------------------------

  @RequirePermission('consultation:book')
  @Post('consultations/:id/rate')
  async rate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(consultationRateSchema)) body: z.output<typeof consultationRateSchema>) {
    const r = await this.prisma.consultation.updateMany({
      where: { id, customerId: u.id, status: 'COMPLETED', ratedAt: null },
      data: { rating: body.rating, review: body.review || null, ratedAt: new Date() },
    });
    if (r.count === 0) throw conflict('NOT_RATEABLE', 'You can rate a consultation once, after it is completed');
    return { ok: true };
  }

  // ---- Reports and photos ---------------------------------------------------------------------

  private async fileList(consultationId: string) {
    const files = await this.prisma.consultationFile.findMany({
      where: { consultationId }, orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, contentType: true, createdAt: true, key: true },
    });
    return Promise.all(files.map(async ({ key, ...f }) => ({ ...f, url: await this.storage.signedReadUrl(key) })));
  }

  @RequirePermission('consultation:book')
  @Post('consultations/:id/files/upload-url')
  async fileUploadUrl(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(consultationFileUploadSchema)) body: z.output<typeof consultationFileUploadSchema>) {
    const c = await this.ownBooking(u.id, id);
    if (!['HOLD', 'CONFIRMED', 'COMPLETED'].includes(c.status)) throw conflict('BOOKING_CLOSED', 'This booking is closed');
    if ((await this.prisma.consultationFile.count({ where: { consultationId: id } })) >= MAX_FILES) {
      throw conflict('TOO_MANY_FILES', `Up to ${MAX_FILES} files per consultation`);
    }
    return this.storage.consultationFileUploadUrl(id, body.contentType);
  }

  @RequirePermission('consultation:book')
  @Post('consultations/:id/files')
  async addFile(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(consultationFileConfirmSchema)) body: z.output<typeof consultationFileConfirmSchema>) {
    const c = await this.ownBooking(u.id, id);
    if (!['HOLD', 'CONFIRMED', 'COMPLETED'].includes(c.status)) throw conflict('BOOKING_CLOSED', 'This booking is closed');
    // Only keys minted for this booking are accepted, so nobody can attach another patient's file.
    if (!body.key.startsWith(`consult/${id}/`) || body.key.includes('..')) throw badRequest('INVALID_FILE', 'Upload the file again');
    if ((await this.prisma.consultationFile.count({ where: { consultationId: id } })) >= MAX_FILES) {
      throw conflict('TOO_MANY_FILES', `Up to ${MAX_FILES} files per consultation`);
    }
    await this.prisma.consultationFile.upsert({
      where: { key: body.key }, update: {},
      create: { consultationId: id, uploadedById: u.id, key: body.key, name: body.name, contentType: body.contentType },
    });
    return this.fileList(id);
  }

  @RequirePermission('consultation:book')
  @Get('consultations/:id/files')
  async files(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.ownBooking(u.id, id);
    return this.fileList(id);
  }

  // ---- What the doctor sees -------------------------------------------------------------------

  /** Health profile, shared files and earlier visits with this doctor, for one of their own bookings. */
  @RequirePermission('doctor:work')
  @Get('doctor/bookings/:id/context')
  async doctorContext(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.consultation.findFirst({
      where: { id, doctor: { userId: u.id }, status: { in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] } },
      select: { id: true, doctorId: true, customerId: true },
    });
    if (!c) throw notFound('Booking not found');
    const [health, files, previous] = await Promise.all([
      this.prisma.patientProfile.findUnique({ where: { userId: c.customerId } }),
      this.fileList(id),
      this.prisma.consultation.count({ where: { doctorId: c.doctorId, customerId: c.customerId, status: 'COMPLETED', id: { not: id } } }),
    ]);
    return { health: health ?? { userId: c.customerId, ...EMPTY_HEALTH }, files, previousVisits: previous };
  }
}

@Module({ imports: [ConsultationsModule, SettingsModule, StorageModule], controllers: [CareController] })
export class CareModule {}
