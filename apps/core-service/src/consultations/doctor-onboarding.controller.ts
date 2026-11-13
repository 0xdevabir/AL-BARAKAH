import { createHash, randomBytes } from 'node:crypto';
import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { doctorAdminUpdateSchema, doctorInviteSchema, productImageUploadSchema } from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import type { z } from 'zod';
import { type AuthUser, CurrentUser, RequirePermission } from '@albarakah/nest-common';
import { badRequest, conflict, notFound, ZodPipe } from '@albarakah/nest-common';
import { ENV, type Env, MailService, PRISMA } from '@albarakah/nest-common';
import { StorageService } from '../storage/storage.module.js';

const INVITE_DAYS = 7;
const MAX_SENDS = 5;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const CHANNEL_LABEL: Record<string, string> = { GOOGLE_MEET: 'Google Meet video', WHATSAPP: 'WhatsApp call' };

/**
 * The doctor lifecycle: a superadmin invites by email → the doctor opens the link, confirms a phone
 * and gets an account (auth-service) → finishes the onboarding wizard here → goes live in the store.
 */
@Controller()
export class DoctorOnboardingController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly mail: MailService,
    private readonly storage: StorageService,
  ) {}

  private link(token: string) {
    // In the fragment, so the token never reaches a server log or a Referer header.
    return `${this.env.STAFF_URL.replace(/\/$/, '')}/join#${token}`;
  }

  private async sendInvite(inv: { email: string; name: string; specialty: string; channels: string[]; expiresAt: Date }, token: string, from: string) {
    const url = this.link(token);
    const until = inv.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Dhaka' });
    const channels = inv.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(' and ');
    const text = [
      `Assalamu alaikum ${inv.name},`,
      '',
      `${from} has invited you to consult on BarakaBari as a ${inv.specialty}. Patients will book ${channels} consultations with you.`,
      '',
      `Set up your account: ${url}`,
      '',
      `You will confirm your mobile number, add your photo and qualifications, and choose your consulting hours. It takes about five minutes. The link works until ${until}.`,
      '',
      'If you were not expecting this, you can ignore this email.',
      '— The BarakaBari team',
    ].join('\n');
    const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2a24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4ded2">
<tr><td style="background:#1f4d3a;padding:28px 32px;color:#ffffff">
<div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.75">BarakaBari Doctors</div>
<div style="font-size:24px;font-weight:700;margin-top:6px">You're invited to consult</div>
</td></tr>
<tr><td style="padding:28px 32px 8px">
<p style="margin:0 0 14px;font-size:16px">Assalamu alaikum <b>${esc(inv.name)}</b>,</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${esc(from)} has invited you to join BarakaBari as a <b>${esc(inv.specialty)}</b>. Patients will book <b>${esc(channels)}</b> consultations with you.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="background:#1f4d3a;border-radius:12px">
<a href="${esc(url)}" style="display:inline-block;padding:14px 26px;color:#ffffff;font-weight:600;font-size:16px;text-decoration:none">Set up my account</a>
</td></tr></table>
<p style="margin:0 0 6px;font-size:14px;font-weight:600">What happens next</p>
<ol style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.7;color:#4a5751">
<li>Confirm the mobile number you'll sign in with</li>
<li>Add your photo, qualifications and a short bio</li>
<li>Choose your consulting hours, then go live</li>
</ol>
<p style="margin:0 0 22px;font-size:13px;color:#7a847f">The link works until ${esc(until)}. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all;color:#1f4d3a">${esc(url)}</span></p>
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #efeae0;font-size:12px;color:#9aa29e">Not expecting this? You can safely ignore it.</td></tr>
</table></td></tr></table></body></html>`;
    await this.mail.send(inv.email, 'Your BarakaBari doctor invitation', text, html);
  }

  private inviteStatus(i: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }) {
    if (i.revokedAt) return 'REVOKED' as const;
    if (i.acceptedAt) return 'ACCEPTED' as const;
    return i.expiresAt < new Date() ? ('EXPIRED' as const) : ('PENDING' as const);
  }

  // ---- superadmin: invitations ----

  @RequirePermission('staff:manage')
  @Get('admin/doctors/invites')
  async invites() {
    const rows = await this.prisma.doctorInvite.findMany({
      where: { acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, email: true, name: true, bmdcNo: true, specialty: true, feePoisha: true, channels: true,
        expiresAt: true, sentCount: true, lastSentAt: true, acceptedAt: true, revokedAt: true, createdAt: true,
        invitedBy: { select: { name: true } },
      },
    });
    return rows.map((r) => ({ ...r, status: this.inviteStatus(r) }));
  }

  @RequirePermission('staff:manage')
  @Post('admin/doctors/invites')
  async invite(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(doctorInviteSchema)) body: z.output<typeof doctorInviteSchema>) {
    const now = new Date();
    const emailUser = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (emailUser && emailUser.role !== 'CUSTOMER') throw conflict('EMAIL_IN_USE', 'This email already belongs to a staff account');
    if (await this.prisma.doctor.findUnique({ where: { bmdcNo: body.bmdcNo } })) throw conflict('BMDC_IN_USE', 'This BMDC number is already registered');
    const open = await this.prisma.doctorInvite.findFirst({
      where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now }, OR: [{ email: body.email }, { bmdcNo: body.bmdcNo }] },
    });
    if (open) throw conflict('INVITE_PENDING', `${open.name} already has an open invitation. Resend it instead.`);

    const token = randomBytes(32).toString('base64url');
    const inv = await this.prisma.doctorInvite.create({
      data: { ...body, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000), invitedById: actor.id },
    });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'doctor.invite', entity: 'DoctorInvite', entityId: inv.id, data: { email: body.email } } });
    const from = (await this.prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } }))?.name || 'The BarakaBari team';
    let emailed = true;
    await this.sendInvite(inv, token, from).catch(() => { emailed = false; });
    // The link is returned too, so the admin can share it another way if email is down or in console mode.
    return { id: inv.id, link: this.link(token), emailed, consoleEmail: this.env.EMAIL_PROVIDER === 'console' };
  }

  @RequirePermission('staff:manage')
  @Post('admin/doctors/invites/:id/resend')
  async resend(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    const inv = await this.prisma.doctorInvite.findUnique({ where: { id } });
    if (!inv || inv.revokedAt) throw notFound('Invitation not found');
    if (inv.acceptedAt) throw conflict('INVITE_USED', 'This doctor has already accepted');
    if (inv.sentCount >= MAX_SENDS) throw conflict('TOO_MANY_SENDS', 'This invitation has been sent too many times. Revoke it and invite again.');
    // A fresh token kills the old link, so a forwarded or leaked email stops working.
    const token = randomBytes(32).toString('base64url');
    const updated = await this.prisma.doctorInvite.update({
      where: { id },
      data: { tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000), sentCount: { increment: 1 }, lastSentAt: new Date() },
    });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'doctor.invite.resend', entity: 'DoctorInvite', entityId: id } });
    const from = (await this.prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } }))?.name || 'The BarakaBari team';
    let emailed = true;
    await this.sendInvite(updated, token, from).catch(() => { emailed = false; });
    return { id, link: this.link(token), emailed, consoleEmail: this.env.EMAIL_PROVIDER === 'console' };
  }

  @RequirePermission('staff:manage')
  @Delete('admin/doctors/invites/:id')
  async revoke(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    const r = await this.prisma.doctorInvite.updateMany({ where: { id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (r.count === 0) throw notFound('Invitation not found or already used');
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'doctor.invite.revoke', entity: 'DoctorInvite', entityId: id } });
    return { ok: true };
  }

  /** What only admins decide: specialty, fee and which call types are offered. */
  @RequirePermission('staff:manage')
  @Patch('admin/doctors/:id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(doctorAdminUpdateSchema)) body: z.output<typeof doctorAdminUpdateSchema>) {
    const d = await this.prisma.doctor.findUnique({ where: { id } });
    if (!d) throw notFound('Doctor not found');
    await this.prisma.doctor.update({
      where: { id },
      data: {
        ...(body.specialty !== undefined ? { specialty: body.specialty } : {}),
        ...(body.feePoisha !== undefined ? { feePoisha: body.feePoisha } : {}),
        ...(body.channels ? { channels: body.channels } : {}),
        ...(body.tier ? { tier: body.tier } : {}),
      },
    });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'doctor.update', entity: 'Doctor', entityId: id, data: body } });
    return { ok: true };
  }

  // ---- doctor: finishing the profile ----

  @RequirePermission('doctor:work')
  @Post('doctor/photo-upload')
  photoUpload(@Body(new ZodPipe(productImageUploadSchema)) body: z.output<typeof productImageUploadSchema>) {
    return this.storage.productImageUploadUrl(body.contentType, 'doctors');
  }

  /** The doctor appears in the store only once their profile is good enough for a patient to choose them. */
  @RequirePermission('doctor:work')
  @Post('doctor/onboarding/complete')
  async complete(@CurrentUser() u: AuthUser) {
    const d = await this.prisma.doctor.findUnique({ where: { userId: u.id }, include: { availability: { select: { id: true } } } });
    if (!d) throw notFound('Doctor profile not found');
    if (d.onboardedAt) return { ok: true, onboardedAt: d.onboardedAt };
    const missing: string[] = [];
    if (!d.qualifications.trim()) missing.push('your qualifications');
    if (d.bio.trim().length < 30) missing.push('a short bio (30+ characters)');
    if (d.channels.includes('GOOGLE_MEET') && !d.meetLink) missing.push('a Google Meet link');
    if (d.channels.includes('WHATSAPP') && !d.whatsapp) missing.push('a WhatsApp number');
    // Duty interns are on call when they switch on; only specialists keep weekly hours.
    if (d.tier === 'SPECIALIST' && !d.availability.length) missing.push('your consulting hours');
    if (missing.length) throw badRequest('PROFILE_INCOMPLETE', `Almost there — add ${missing.join(', ')}.`);
    const done = await this.prisma.doctor.update({ where: { id: d.id }, data: { onboardedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { actorId: u.id, action: 'doctor.onboarded', entity: 'Doctor', entityId: d.id } });
    return { ok: true, onboardedAt: done.onboardedAt };
  }
}
