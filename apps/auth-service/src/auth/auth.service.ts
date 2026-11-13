import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@albarakah/database';
import type { Role } from '@albarakah/contracts';
import { authenticator } from 'otplib';
import { AppError, badRequest, conflict, unauthorized } from '@albarakah/nest-common';
import { PRISMA } from '@albarakah/nest-common';
import { type AuthUser, SessionService, TokenService } from '@albarakah/nest-common';
import { ENV, type Env } from '@albarakah/nest-common';
import { MailService } from '@albarakah/nest-common';
import { SmsService } from '../notifications/sms.service.js';

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_WINDOW = 3;
const OTP_WINDOW_MS = 10 * 60_000;
const REFRESH_TTL_MS = 30 * 24 * 3_600_000;

/** Must match the accounts in packages/database/src/seed.ts. */
export const DEMO_PHONES = {
  CUSTOMER: '+8801700000004',
  ADMIN: '+8801700000001',
  RIDER: '+8801700000002',
  DOCTOR: '+8801700000003',
} as const;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; phone: string; email: string | null; name: string; role: Role; totpEnabled: boolean; mfa: boolean };
}

@Injectable()
export class AuthService {
  private readonly totpKey: Buffer;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly tokens: TokenService,
    private readonly sms: SmsService,
    private readonly mail: MailService,
    private readonly sessions: SessionService,
  ) {
    this.totpKey = createHash('sha256').update(env.TOTP_ENCRYPTION_KEY).digest();
  }

  private hashOtp(phone: string, code: string) {
    return createHmac('sha256', this.env.OTP_PEPPER).update(`${phone}:${code}`).digest('hex');
  }

  async requestOtp(phone: string): Promise<void> {
    const since = new Date(Date.now() - OTP_WINDOW_MS);
    const recent = await this.prisma.otpCode.count({ where: { phone, createdAt: { gte: since } } });
    if (recent >= OTP_MAX_PER_WINDOW) throw new AppError(429, 'OTP_RATE_LIMITED', 'Too many codes requested. Please try again in a few minutes.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.otpCode.create({
      data: { phone, codeHash: this.hashOtp(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    // BulkSMSBD requires exactly this wording for OTP messages.
    await this.sms.send(phone, `Your BarakaBari OTP is ${code}`);
  }

  /** Checks and burns the latest SMS code for this phone. Throws OTP_INVALID on any mismatch. */
  private async consumeOtp(phone: string, code: string): Promise<void> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    const invalid = () => badRequest('OTP_INVALID', 'That code is incorrect or has expired');
    if (!otp) throw invalid();
    // The attempt is counted atomically first, so parallel guesses cannot exceed the limit.
    const counted = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, attempts: { lt: OTP_MAX_ATTEMPTS }, consumedAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) throw invalid();
    const a = Buffer.from(otp.codeHash, 'hex');
    const b = Buffer.from(this.hashOtp(phone, code), 'hex');
    if (!timingSafeEqual(a, b)) throw invalid();
    const consumed = await this.prisma.otpCode.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count === 0) throw invalid();
  }

  async verifyOtp(phone: string, code: string, name?: string): Promise<Session> {
    await this.consumeOtp(phone, code);

    const user = await this.prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone, name: name ?? '', role: 'CUSTOMER' },
    });
    if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
    if (name && !user.name) await this.prisma.user.update({ where: { id: user.id }, data: { name } });
    return this.issue(user.id, false, randomBytes(16).toString('hex'));
  }

  /** Email login still binds a phone — every account needs a number for delivery and SMS alerts. */
  async requestEmailOtp(email: string, phone: string): Promise<void> {
    const since = new Date(Date.now() - OTP_WINDOW_MS);
    const recent = await this.prisma.otpCode.count({ where: { phone: email, createdAt: { gte: since } } });
    if (recent >= OTP_MAX_PER_WINDOW) throw new AppError(429, 'OTP_RATE_LIMITED', 'Too many codes requested. Please try again in a few minutes.');
    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    const byPhone = await this.prisma.user.findUnique({ where: { phone } });
    if (byEmail && byEmail.phone !== phone) {
      throw badRequest('EMAIL_IN_USE', 'This email is already linked to a different mobile number');
    }
    if (byPhone?.email && byPhone.email !== email) {
      throw badRequest('PHONE_IN_USE', 'This mobile number is already linked to a different email');
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    // OtpCode.phone stores the destination key for both SMS and email codes.
    await this.prisma.otpCode.create({
      data: { phone: email, codeHash: this.hashOtp(email, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    await this.mail.send(email, 'Your BarakaBari verification code', `Your BarakaBari verification code is ${code}. It expires in 5 minutes.`);
  }

  async verifyEmailOtp(email: string, phone: string, code: string, name?: string): Promise<Session> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone: email, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    const invalid = () => badRequest('OTP_INVALID', 'That code is incorrect or has expired');
    if (!otp) throw invalid();
    const counted = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, attempts: { lt: OTP_MAX_ATTEMPTS }, consumedAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) throw invalid();
    const a = Buffer.from(otp.codeHash, 'hex');
    const b = Buffer.from(this.hashOtp(email, code), 'hex');
    if (!timingSafeEqual(a, b)) throw invalid();
    const consumed = await this.prisma.otpCode.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count === 0) throw invalid();

    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    const byPhone = await this.prisma.user.findUnique({ where: { phone } });
    if (byEmail && byPhone && byEmail.id !== byPhone.id) {
      throw badRequest('ACCOUNT_CONFLICT', 'This email and mobile number belong to different accounts');
    }
    if (byEmail && byEmail.phone !== phone) {
      throw badRequest('EMAIL_IN_USE', 'This email is already linked to a different mobile number');
    }
    if (byPhone?.email && byPhone.email !== email) {
      throw badRequest('PHONE_IN_USE', 'This mobile number is already linked to a different email');
    }

    const user = byPhone
      ? await this.prisma.user.update({
          where: { id: byPhone.id },
          data: {
            email,
            ...(name && !byPhone.name ? { name } : {}),
          },
        })
      : await this.prisma.user.create({
          data: { phone, email, name: name ?? '', role: 'CUSTOMER' },
        });
    if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
    return this.issue(user.id, false, randomBytes(16).toString('hex'));
  }

  // ---- doctor invitations: the emailed link proves the address, the SMS code binds the login phone ----

  private async liveInvite(token: string) {
    const inv = await this.prisma.doctorInvite.findUnique({
      where: { tokenHash: sha256(token) },
      include: { invitedBy: { select: { name: true } } },
    });
    if (!inv || inv.revokedAt) throw new AppError(404, 'INVITE_INVALID', 'This invitation link is not valid. Ask the BarakaBari team for a new one.');
    if (inv.acceptedAt) throw new AppError(410, 'INVITE_USED', 'This invitation has already been used. Sign in with your mobile number instead.');
    if (inv.expiresAt < new Date()) throw new AppError(410, 'INVITE_EXPIRED', 'This invitation has expired. Ask the BarakaBari team to send a new one.');
    return inv;
  }

  async inviteInfo(token: string) {
    const inv = await this.liveInvite(token);
    return {
      name: inv.name, email: inv.email, bmdcNo: inv.bmdcNo, specialty: inv.specialty, feePoisha: inv.feePoisha,
      channels: inv.channels, expiresAt: inv.expiresAt, invitedBy: inv.invitedBy.name,
    };
  }

  /** A doctor's login phone may be a customer account (it is upgraded) but never another staff account. */
  private async assertPhoneFreeForDoctor(phone: string) {
    const u = await this.prisma.user.findUnique({ where: { phone } });
    if (u && u.role !== 'CUSTOMER') throw conflict('PHONE_IN_USE', 'This number already belongs to a staff account. Use a different number.');
    if (u && !u.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  async requestInviteOtp(token: string, phone: string): Promise<void> {
    await this.liveInvite(token);
    await this.assertPhoneFreeForDoctor(phone);
    await this.requestOtp(phone);
  }

  async acceptInvite(token: string, phone: string, code: string): Promise<Session> {
    const inv = await this.liveInvite(token);
    await this.assertPhoneFreeForDoctor(phone);
    await this.consumeOtp(phone, code);
    const emailOwner = await this.prisma.user.findUnique({ where: { email: inv.email } });

    const userId = await this.prisma.$transaction(async (tx) => {
      // Claiming first means two tabs racing on one link create one account.
      const claimed = await tx.doctorInvite.updateMany({ where: { id: inv.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
      if (claimed.count === 0) throw new AppError(410, 'INVITE_USED', 'This invitation has already been used. Sign in with your mobile number instead.');
      if (await tx.doctor.findUnique({ where: { bmdcNo: inv.bmdcNo } })) throw conflict('BMDC_IN_USE', 'This BMDC number is already registered. Contact the BarakaBari team.');
      const existing = await tx.user.findUnique({ where: { phone } });
      if (existing && existing.role !== 'CUSTOMER') throw conflict('PHONE_IN_USE', 'This number already belongs to a staff account. Use a different number.');
      // The invite email becomes the account email unless another account already owns it.
      const email = !emailOwner || emailOwner.phone === phone ? inv.email : undefined;
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { role: 'DOCTOR', name: inv.name, ...(email && !existing.email ? { email } : {}) } })
        : await tx.user.create({ data: { phone, name: inv.name, role: 'DOCTOR', ...(email ? { email } : {}) } });
      const doctor = await tx.doctor.create({
        data: {
          userId: user.id, bmdcNo: inv.bmdcNo, specialty: inv.specialty, feePoisha: inv.feePoisha, channels: inv.channels, tier: inv.tier,
          languages: ['Bangla', 'English'], whatsapp: inv.channels.includes('WHATSAPP') ? phone : null,
        },
      });
      await tx.doctorInvite.update({ where: { id: inv.id }, data: { doctorId: doctor.id } });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'doctor.invite.accept', entity: 'Doctor', entityId: doctor.id } });
      return user.id;
    });
    // A customer session from before the upgrade carries the old role.
    await this.sessions.revokeAllForUser(userId);
    return this.issue(userId, false, randomBytes(16).toString('hex'));
  }

  /** Only reachable when DEMO_LOGIN is on. The demo admin skips TOTP so testers get straight in. */
  async demoLogin(role: keyof typeof DEMO_PHONES): Promise<Session> {
    const user = await this.prisma.user.findFirst({ where: { phone: DEMO_PHONES[role], role, isActive: true } });
    if (!user) throw new AppError(404, 'DEMO_ACCOUNT_MISSING', 'Demo account not found. Run pnpm db:seed first.');
    return this.issue(user.id, role === 'ADMIN', randomBytes(16).toString('hex'));
  }

  private async issue(userId: string, mfa: boolean, familyId: string): Promise<Session> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: sha256(refreshToken), familyId, mfa, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    const auth: AuthUser = { id: user.id, role: user.role, mfa };
    return {
      accessToken: await this.tokens.sign(auth),
      refreshToken,
      user: { id: user.id, phone: user.phone, email: user.email, name: user.name, role: user.role, totpEnabled: user.totpEnabled, mfa },
    };
  }

  /** Rotates the token. Presenting an already-used token means theft, so that whole login is revoked. */
  async refresh(token: string): Promise<Session> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.expiresAt < new Date()) throw unauthorized('Your session has expired');
    const claimed = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (claimed.count === 0) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthorized('Your session has expired');
    }
    if (!row.user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
    return this.issue(row.userId, row.mfa, row.familyId);
  }

  async logout(token: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (row) await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sessions.revokeAllForUser(userId);
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.totpKey, iv);
    const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
  }

  private decrypt(blob: string): string {
    const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64')) as [Buffer, Buffer, Buffer];
    const d = createDecipheriv('aes-256-gcm', this.totpKey, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  }

  async totpSetup(user: AuthUser) {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (row.totpEnabled) throw badRequest('TOTP_ALREADY_ENABLED', 'Two-factor authentication is already on');
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: user.id }, data: { totpSecret: this.encrypt(secret) } });
    return { secret, otpauthUrl: authenticator.keyuri(row.phone, 'BarakaBari', secret) };
  }

  /** Confirms a code from the authenticator app and upgrades this login to a 2FA session. */
  async totpVerify(user: AuthUser, code: string, refreshToken: string | undefined): Promise<Session> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!row.totpSecret || !authenticator.check(code, this.decrypt(row.totpSecret))) {
      throw badRequest('TOTP_INVALID', 'That code is incorrect');
    }
    if (!row.totpEnabled) await this.prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    let familyId = randomBytes(16).toString('hex');
    if (refreshToken) {
      const old = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
      if (old?.userId === user.id) {
        familyId = old.familyId;
        await this.prisma.refreshToken.updateMany({ where: { id: old.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    }
    return this.issue(user.id, true, familyId);
  }
}
