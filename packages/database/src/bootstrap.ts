import { DEFAULT_FEES, DEFAULT_SCHEDULE } from '@albarakah/domain';
import { createPrisma } from './index.js';

/**
 * Safe to run on every deploy: it creates what production needs to start, and never changes
 * existing rows. FIRST_ADMIN_PHONE is the first person able to sign in to the admin portal.
 */
const prisma = createPrisma(process.env.DATABASE_URL!);

await prisma.setting.upsert({
  where: { key: 'app' },
  update: {},
  create: { key: 'app', value: { ...DEFAULT_FEES, ...DEFAULT_SCHEDULE, requireRxUpload: false } },
});

const phone = process.env.FIRST_ADMIN_PHONE;
if (phone) {
  if (!/^\+8801\d{9}$/.test(phone)) throw new Error('FIRST_ADMIN_PHONE must look like +8801XXXXXXXXX');
  await prisma.user.upsert({ where: { phone }, update: {}, create: { phone, name: 'Admin', role: 'ADMIN' } });
}

await prisma.$disconnect();
console.log('Bootstrap complete');
