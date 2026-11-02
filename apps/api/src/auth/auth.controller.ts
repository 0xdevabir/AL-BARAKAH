import { Body, Controller, Get, HttpCode, Inject, Module, Post, Req, Res } from '@nestjs/common';
import { RouteConfig } from '@nestjs/platform-fastify';
import { otpRequestSchema, otpVerifySchema, totpCodeSchema } from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { type z } from 'zod';
import { Authenticated, type AuthUser, CurrentUser, Public } from '../common/auth.js';
import { forbidden, unauthorized, ZodPipe } from '../common/errors.js';
import { PRISMA } from '../common/infra.module.js';
import { ENV, type Env } from '../config/env.js';
import { SmsService } from '../notifications/sms.service.js';
import { AuthService, type Session } from './auth.service.js';

const COOKIE = 'albarakah_refresh';
const THIRTY_DAYS = 30 * 24 * 3600;
/** Per IP, on top of the per-phone limits in AuthService. */
const StrictLimit = () => RouteConfig({ rateLimit: { max: 10, timeWindow: '10 minutes' } });

/**
 * Web keeps the refresh token in an httpOnly cookie that scripts cannot read. The Capacitor app has
 * no such cookie jar across origins, so it sends `X-Client: native` and stores the token in secure storage.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, @Inject(ENV) private readonly env: Env, @Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private isNative(req: FastifyRequest) {
    return req.headers['x-client'] === 'native';
  }

  /** Cookie-authenticated routes reject other sites, which stops cross-site request forgery. */
  private assertOrigin(req: FastifyRequest) {
    if (this.isNative(req)) return;
    const origin = req.headers.origin;
    if (origin && !this.env.CORS_ORIGINS.includes(origin)) throw forbidden('Request origin not allowed');
  }

  private readToken(req: FastifyRequest, body?: { refreshToken?: unknown }): string | undefined {
    if (this.isNative(req)) return typeof body?.refreshToken === 'string' ? body.refreshToken : undefined;
    return req.cookies[COOKIE];
  }

  private respond(req: FastifyRequest, res: FastifyReply, s: Session) {
    if (this.isNative(req)) return s;
    void res.setCookie(COOKIE, s.refreshToken, {
      httpOnly: true, secure: this.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: THIRTY_DAYS,
    });
    return { accessToken: s.accessToken, user: s.user };
  }

  @Public()
  @StrictLimit()
  @Post('otp/request')
  async request(@Body(new ZodPipe(otpRequestSchema)) body: z.output<typeof otpRequestSchema>) {
    await this.auth.requestOtp(body.phone);
    return { ok: true };
  }

  @Public()
  @StrictLimit()
  @Post('otp/verify')
  @HttpCode(200)
  async verify(
    @Body(new ZodPipe(otpVerifySchema)) body: z.output<typeof otpVerifySchema>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    this.assertOrigin(req);
    return this.respond(req, res, await this.auth.verifyOtp(body.phone, body.code, body.name));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: { refreshToken?: unknown } | undefined, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    this.assertOrigin(req);
    const token = this.readToken(req, body);
    if (!token) throw unauthorized();
    return this.respond(req, res, await this.auth.refresh(token));
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() body: { refreshToken?: unknown } | undefined, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    this.assertOrigin(req);
    const token = this.readToken(req, body);
    if (token) await this.auth.logout(token);
    void res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }

  @Authenticated()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { id: row.id, phone: row.phone, name: row.name, role: row.role, totpEnabled: row.totpEnabled, mfa: user.mfa };
  }

  @Authenticated()
  @Post('totp/setup')
  totpSetup(@CurrentUser() user: AuthUser) {
    return this.auth.totpSetup(user);
  }

  @Authenticated()
  @StrictLimit()
  @Post('totp/verify')
  @HttpCode(200)
  async totpVerify(
    @CurrentUser() user: AuthUser,
    @Body() body: { code?: unknown; refreshToken?: unknown },
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    this.assertOrigin(req);
    const { code } = new ZodPipe(totpCodeSchema).transform({ code: body.code });
    return this.respond(req, res, await this.auth.totpVerify(user, code, this.readToken(req, body)));
  }
}

@Module({ controllers: [AuthController], providers: [AuthService, SmsService], exports: [AuthService, SmsService] })
export class AuthModule {}
