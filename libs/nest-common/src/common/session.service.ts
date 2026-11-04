import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@albarakah/database';
import { PRISMA } from './tokens.js';

/** Shared so core can invalidate sessions after staff role changes without calling auth-service. */
@Injectable()
export class SessionService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  revokeAllForUser(userId: string): Promise<{ count: number }> {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

