import { type CanActivate, createParamDecorator, type ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission, type Role, roleHas } from '@albarakah/contracts';
import type { FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import { ENV, type Env } from '../config/env.js';
import { forbidden, unauthorized } from './errors.js';

export interface AuthUser { id: string; role: Role; mfa: boolean }
export type AuthedRequest = FastifyRequest & { user?: AuthUser };

const PUBLIC_KEY = 'auth:public';
const PERMISSION_KEY = 'auth:permission';
const AUTHENTICATED_KEY = 'auth:authenticated';

/** Open to anyone. Must be stated explicitly: a route with no decorator is refused. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Any signed-in user, including an admin who has not yet finished 2FA (used by the 2FA setup routes). */
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);
export const RequirePermission = (p: Permission) => SetMetadata(PERMISSION_KEY, p);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw unauthorized();
  return user;
});

/** Reports how a handler is protected; shared by the guard and the route-coverage test. */
export function routeAccess(reflector: Reflector, targets: (object | Function)[]) {
  const t = targets as Function[];
  return {
    isPublic: reflector.getAllAndOverride<boolean>(PUBLIC_KEY, t) === true,
    authenticated: reflector.getAllAndOverride<boolean>(AUTHENTICATED_KEY, t) === true,
    permission: reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, t),
  };
}

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) env: Env) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  sign(user: AuthUser): Promise<string> {
    return new SignJWT({ role: user.role, mfa: user.mfa })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setIssuer('albarakah')
      .setExpirationTime('15m')
      .sign(this.key);
  }

  async verify(token: string): Promise<AuthUser> {
    const { payload } = await jwtVerify(token, this.key, { issuer: 'albarakah', algorithms: ['HS256'] });
    return { id: payload.sub!, role: payload.role as Role, mfa: payload.mfa === true };
  }
}

/** Global and deny-by-default. Admins get no bypass: they hold only what the catalog grants them. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tokens: TokenService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const access = routeAccess(this.reflector, [ctx.getHandler(), ctx.getClass()]);
    if (access.isPublic) return true;
    if (!access.authenticated && !access.permission) throw forbidden('This route has no access rule');

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    let user: AuthUser;
    try {
      user = await this.tokens.verify(header.slice(7));
    } catch {
      throw unauthorized('Your session has expired');
    }
    req.user = user;
    if (access.authenticated) return true;
    // A stolen phone number alone must not open the admin panel, so admins need 2FA first.
    if (user.role === 'ADMIN' && !user.mfa) throw forbidden('Two-factor authentication is required');
    if (!roleHas(user.role, access.permission!)) throw forbidden();
    return true;
  }
}
