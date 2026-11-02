import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createPrisma } from '@albarakah/database';

/** Tests run on their own database, so they can never touch development data. */
export default async function setup() {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'));
  const url = new URL(process.env.DATABASE_URL!);
  const admin = createPrisma(url.toString(), 1);
  const exists = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = 'albarakah_test'`;
  if (exists.length === 0) await admin.$executeRawUnsafe('CREATE DATABASE albarakah_test');
  await admin.$disconnect();
  url.pathname = '/albarakah_test';
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '../../../packages/database'),
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
