// Resets a dedicated database, then runs the API with its log in a file, because
// dev-mode OTP codes only appear there. Development data and queues are never touched.
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrisma } from '@albarakah/database';

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
const env = { ...process.env, DATABASE_URL: url.toString(), REDIS_URL: redis.toString(), SMS_PROVIDER: 'console', BKASH_MODE: 'fake' };

const run = (cmd, cwd) => execSync(cmd, { cwd: resolve(root, cwd), env, stdio: 'inherit' });
run('pnpm exec prisma migrate deploy', 'packages/database');
run('pnpm build', 'packages/database');
run('node dist/seed.js', 'packages/database');
run('pnpm build', 'apps/api');

mkdirSync(resolve(import.meta.dirname, '.run'), { recursive: true });
const log = openSync(resolve(import.meta.dirname, '.run/api.log'), 'w');
const api = spawn('node', ['dist/main.js'], { cwd: resolve(root, 'apps/api'), env, stdio: ['ignore', log, log] });
api.on('exit', (code) => process.exit(code ?? 1));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => api.kill(sig));
