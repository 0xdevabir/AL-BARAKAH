import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export * from './generated/client.js';

export function createPrisma(url: string, max = 10): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max }) });
}
