// Resets a dedicated database, then runs gateway + auth + core with logs in files, because
// dev-mode OTP codes only appear in the auth log. Development data and queues are never touched.
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrisma } from '@albarakah/database';
import { Redis } from 'ioredis';

const root = resolve(import.meta.dirname, '../..');
process.loadEnvFile(resolve(root, '.env'));

const url = new URL(process.env.DATABASE_URL);
const admin = createPrisma(url.toString(), 1);
await admin.$executeRawUnsafe('DROP DATABASE IF EXISTS albarakah_e2e WITH (FORCE)');
await admin.$executeRawUnsafe('CREATE DATABASE albarakah_e2e');
await admin.$disconnect();
url.pathname = '/albarakah_e2e';

const redis = new URL(process.env.REDIS_URL);
redis.pathname = '/5';
const r = new Redis(redis.toString());
await r.flushdb();
r.disconnect();

const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  REDIS_URL: redis.toString(),
  SMS_PROVIDER: 'console',
  BKASH_MODE: 'fake',
  DEMO_LOGIN: 'true',
  AUTH_SERVICE_URL: 'http://127.0.0.1:4010',
  CORE_SERVICE_URL: 'http://127.0.0.1:4020',
};

const run = (cmd, cwd) => execSync(cmd, { cwd: resolve(root, cwd), env, stdio: 'inherit' });
run('pnpm exec prisma migrate deploy', 'libs/database');
run('pnpm build', 'libs/database');
run('node dist/seed.js', 'libs/database');
run('pnpm build', 'libs/nest-common');
run('pnpm build', 'apps/auth-service');
run('pnpm build', 'apps/core-service');
run('pnpm build', 'apps/gateway');

mkdirSync(resolve(import.meta.dirname, '.run'), { recursive: true });
const kids = [];
function start(name, cwd, port, extra = {}) {
  const log = openSync(resolve(import.meta.dirname, `.run/${name}.log`), 'w');
  const child = spawn('node', ['dist/main.js'], {
    cwd: resolve(root, cwd),
    env: { ...env, PORT: String(port), ...extra },
    stdio: ['ignore', log, log],
  });
  kids.push(child);
  child.on('exit', (code) => {
    for (const k of kids) k.kill();
    process.exit(code ?? 1);
  });
}

start('auth', 'apps/auth-service', 4010);
start('core', 'apps/core-service', 4020, { SERVICE_ROLE: 'api' });
start('gateway', 'apps/gateway', 4000);

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => kids.forEach((k) => k.kill(sig)));
