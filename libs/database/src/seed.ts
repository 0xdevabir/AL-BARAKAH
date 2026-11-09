import { DEFAULT_FEES, DEFAULT_SCHEDULE } from '@albarakah/domain';
import { createPrisma } from './index.js';

/**
 * Idempotent demo data for local development. Prices and stock are illustrative, not a real catalog.
 * The guard below keeps demo accounts out of production.
 */
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production');

const prisma = createPrisma(process.env.DATABASE_URL!);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const catalog: Record<string, [string, string, string, string, string, number, boolean][]> = {
  'Fever & Pain': [
    ['Napa', 'Paracetamol', 'Tablet', '500 mg', '10 tablets', 1200, false],
    ['Napa Extra', 'Paracetamol + Caffeine', 'Tablet', '500 mg + 65 mg', '10 tablets', 2500, false],
    ['Ace Syrup', 'Paracetamol', 'Syrup', '120 mg/5 ml', '60 ml', 3500, false],
    ['Ibuprofen', 'Ibuprofen', 'Tablet', '400 mg', '10 tablets', 2000, false],
  ],
  'Cold & Allergy': [
    ['Fexo', 'Fexofenadine', 'Tablet', '120 mg', '10 tablets', 9000, false],
    ['Alatrol', 'Cetirizine', 'Tablet', '10 mg', '10 tablets', 3000, false],
    ['Tusca Syrup', 'Herbal cough syrup', 'Syrup', '', '100 ml', 8500, false],
  ],
  Stomach: [
    ['Seclo', 'Omeprazole', 'Capsule', '20 mg', '10 capsules', 5000, false],
    ['Sergel', 'Esomeprazole', 'Capsule', '20 mg', '10 capsules', 7000, false],
    ['Orsaline-N', 'Oral rehydration salts', 'Sachet', '', '5 sachets', 3000, false],
  ],
  'Antibiotics': [
    ['Azithrocin', 'Azithromycin', 'Tablet', '500 mg', '3 tablets', 12000, true],
    ['Moxacil', 'Amoxicillin', 'Capsule', '500 mg', '10 capsules', 9000, true],
  ],
  'Diabetes & Heart': [
    ['Comet', 'Metformin', 'Tablet', '500 mg', '10 tablets', 4000, true],
    ['Osartil', 'Losartan', 'Tablet', '50 mg', '10 tablets', 8000, true],
  ],
};

async function main() {
  await prisma.setting.upsert({
    where: { key: 'app' },
    update: {},
    create: { key: 'app', value: { ...DEFAULT_FEES, ...DEFAULT_SCHEDULE, requireRxUpload: false } },
  });

  for (const [name, fee] of [['Daffodil Smart City', 4000], ['Ashulia', 6000], ['Dhanmondi', 8000]] as const) {
    await prisma.zone.upsert({ where: { name }, update: {}, create: { name, deliveryFeePoisha: fee } });
  }

  let sortOrder = 0;
  for (const [catName, meds] of Object.entries(catalog)) {
    const cat = await prisma.category.upsert({
      where: { slug: slug(catName) },
      update: {},
      create: { name: catName, slug: slug(catName), sortOrder: sortOrder++ },
    });
    for (const [name, genericName, form, strength, packSize, pricePoisha, isRx] of meds) {
      const s = slug(`${name} ${strength}`);
      const med = await prisma.medicine.upsert({
        where: { slug: s },
        update: {},
        create: { slug: s, name, genericName, form, strength, packSize, pricePoisha, isRx, categoryId: cat.id, manufacturer: 'Demo Pharma' },
      });
      await prisma.batch.upsert({
        where: { medicineId_batchNo: { medicineId: med.id, batchNo: 'DEMO-1' } },
        update: {},
        create: { medicineId: med.id, batchNo: 'DEMO-1', expiresAt: new Date('2028-12-31'), qtyRemaining: 200 },
      });
    }
  }

  const user = (phone: string, name: string, role: 'CUSTOMER' | 'ADMIN' | 'RIDER' | 'DOCTOR') =>
    prisma.user.upsert({ where: { phone }, update: {}, create: { phone, name, role } });
  await user('+8801700000004', 'Demo Customer', 'CUSTOMER');
  await user('+8801700000001', 'Demo Admin', 'ADMIN');
  await user('+8801700000002', 'Demo Rider', 'RIDER');
  const docUser = await user('+8801700000003', 'Dr. Demo Rahman', 'DOCTOR');
  const doctor = await prisma.doctor.upsert({
    where: { userId: docUser.id },
    update: {},
    create: {
      userId: docUser.id, bmdcNo: 'DEMO-0001', specialty: 'General Physician',
      bio: 'Family physician with a focus on fever, diabetes, blood pressure and everyday illness. I explain clearly and keep follow-ups simple.',
      qualifications: 'MBBS, FCPS (Medicine)', experienceYears: 8, workplace: 'Dhaka Medical College Hospital',
      languages: ['Bangla', 'English'], onboardedAt: new Date(), channels: ['GOOGLE_MEET', 'WHATSAPP'],
      meetLink: 'https://meet.google.com/demo-link', whatsapp: '+8801700000003',
    },
  });
  if ((await prisma.availability.count({ where: { doctorId: doctor.id } })) === 0) {
    await prisma.availability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ doctorId: doctor.id, weekday, startMinute: 9 * 60, endMinute: 21 * 60, slotMinutes: 30 })),
    });
  }
  console.log('Seed complete');
}

main().finally(() => prisma.$disconnect());
