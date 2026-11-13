import { z } from 'zod';

/** Accepts 01XXXXXXXXX, 8801XXXXXXXXX or +8801XXXXXXXXX; normalises to +8801XXXXXXXXX. */
export const phoneSchema = z.string().trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(\+?88)?01[3-9]\d{8}$/, 'Enter a valid Bangladeshi mobile number'))
  .transform((v) => `+88${v.slice(-11)}`);

export const otpRequestSchema = z.object({ phone: phoneSchema });
export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/),
  name: z.string().trim().min(1).max(80).optional(),
});

/** Lower-case email used for the optional email OTP login path. */
export const emailSchema = z.string().trim().toLowerCase().max(120).pipe(z.email('Enter a valid email address'));

/** Email login still requires a Bangladeshi mobile — phone is mandatory on every account. */
export const emailOtpRequestSchema = z.object({
  email: emailSchema,
  phone: phoneSchema,
});
export const emailOtpVerifySchema = z.object({
  email: emailSchema,
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/),
  name: z.string().trim().min(1).max(80).optional(),
});
export const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40),
  line: z.string().trim().min(3).max(200),
  zoneId: z.string().min(1),
  phone: phoneSchema,
  notes: z.string().trim().max(200).optional(),
  /** Map pin. Both or neither, and only inside Bangladesh. */
  lat: z.number().min(20.3).max(26.8).optional(),
  lng: z.number().min(88).max(92.8).optional(),
}).refine((a) => (a.lat === undefined) === (a.lng === undefined), { message: 'Drop a pin on the map', path: ['lat'] });

/** A rider's GPS fix, sent every few seconds while on shift. */
export const riderLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).nullable().optional(),
  speed: z.number().min(0).max(100).nullable().optional(),
  accuracy: z.number().min(0).max(10_000).nullable().optional(),
});

export const placeOrderSchema = z.object({
  idempotencyKey: z.string().min(8).max(64),
  addressId: z.string().min(1),
  type: z.enum(['NORMAL', 'EMERGENCY']),
  slotStart: z.iso.datetime().optional(),
  paymentMethod: z.enum(['COD', 'BKASH']),
  prescriptionKey: z.string().max(200).optional(),
  /** A completed consultation of this customer whose e-prescription covers the Rx medicines. */
  consultationId: z.string().min(1).max(40).optional(),
  notes: z.string().trim().max(300).optional(),
  /** May be empty when a prescription is uploaded: the pharmacy then fills the order from the prescription. */
  items: z.array(z.object({ medicineId: z.string().min(1), qty: z.number().int().min(1).max(50), unit: z.enum(['PACK', 'PIECE']).default('PACK') })).max(50).default([]),
}).refine((o) => o.type === 'EMERGENCY' || !!o.slotStart, { message: 'Choose a delivery time', path: ['slotStart'] })
  .refine((o) => o.items.length > 0 || !!o.prescriptionKey, { message: 'Add medicines or upload a prescription', path: ['items'] });

/** The pharmacy fills a prescription-only order (or corrects one) before confirming it. */
export const adminOrderItemsSchema = z.object({
  items: z.array(z.object({ medicineId: z.string().min(1), qty: z.number().int().min(1).max(50), unit: z.enum(['PACK', 'PIECE']).default('PACK') })).min(1).max(50),
  note: z.string().trim().max(300).optional(),
});

/** A customer asks the pharmacy to stock a medicine it doesn't have. */
export const medicineRequestSchema = z.object({
  medicineId: z.string().min(1).max(40).optional(),
  name: z.string().trim().min(2).max(160),
  qty: z.number().int().min(1).max(100).default(1),
  note: z.string().trim().max(300).optional(),
});
export const medicineRequestStatusSchema = z.object({ status: z.enum(['OPEN', 'SOURCING', 'FULFILLED', 'CLOSED']) });

export const expenseSchema = z.object({
  category: z.string().trim().min(1).max(60),
  amountPoisha: z.number().int().min(1).max(10_000_000_000),
  note: z.string().trim().max(300).optional(),
  spentAt: z.iso.date(),
});

export const medicineSchema = z.object({
  name: z.string().trim().min(1).max(160),
  genericName: z.string().trim().min(1).max(200),
  manufacturer: z.string().trim().max(160).default(''),
  form: z.string().trim().min(1).max(60),
  strength: z.string().trim().max(80).default(''),
  packSize: z.string().trim().max(80).default(''),
  pricePoisha: z.number().int().min(0).max(100_000_000),
  isRx: z.boolean().default(false),
  isActive: z.boolean().default(true),
  categoryId: z.string().min(1),
  description: z.string().trim().max(2000).default(''),
  imageUrl: z.string().trim().max(500).default(''),
  reorderLevel: z.number().int().min(0).max(100_000).default(10),
  /** Extra days the pharmacy needs to source a rare medicine; pushes delivery back and rules out emergency. */
  sourcingDays: z.number().int().min(0).max(2).default(0),
});
export const batchSchema = z.object({
  batchNo: z.string().trim().min(1).max(40),
  expiresAt: z.iso.date(),
  qty: z.number().int().min(1).max(1_000_000),
});
export const zoneSchema = z.object({
  name: z.string().trim().min(1).max(80),
  deliveryFeePoisha: z.number().int().min(0).max(10_000_000),
  isActive: z.boolean().default(true),
});
  export const settingsSchema = z.object({
   emergencyFeePoisha: z.number().int().min(0),
   riderPayoutPoisha: z.number().int().min(0),
   riderEmergencyBonusPoisha: z.number().int().min(0),
   doctorBookingFeePoisha: z.number().int().min(0),
   requireRxUpload: z.boolean(),
   leadHours: z.number().int().min(0).max(72),
   openHour: z.number().int().min(0).max(23),
   closeHour: z.number().int().min(1).max(24),
   slotHours: z.number().int().min(1).max(6),
   daysAhead: z.number().int().min(0).max(14),
   emergencyStartHour: z.number().int().min(0).max(23),
   emergencyEndHour: z.number().int().min(1).max(24),
   emergencyMinutes: z.number().int().min(15).max(240),
   /** Highest Android versionCode the store should accept. 0 = update checks off. */
   androidLatestVersionCode: z.number().int().min(0).default(0),
   androidLatestVersionName: z.string().max(40).default(''),
   /** Empty = use STORE_URL/download/barakabari.apk */
   androidApkUrl: z.string().max(500).default(''),
   androidForceUpdate: z.boolean().default(false),
   androidUpdateNotes: z.string().max(500).default(''),
   /** Where riders pick orders up. Shown on every delivery map. */
   pharmacyLat: z.number().min(20.3).max(26.8).default(23.7808),
   pharmacyLng: z.number().min(88).max(92.8).default(90.4067),
   pharmacyAddress: z.string().max(200).default(''),
   /** Phone numbers shown on every store page for urgent help. */
   hotlines: z.array(z.string().trim().regex(/^\+?[0-9 -]{3,20}$/, 'Enter a phone number')).max(4).default([]),
   instantConsultFeePoisha: z.number().int().min(0).max(10_000_000).default(30000),
   /** Minutes an on-duty intern has to accept an instant consultation before it is flagged. */
   instantResponseMinutes: z.number().int().min(1).max(60).default(10),
   /** The platform's share of each consultation fee, in whole percent. */
   doctorCommissionPct: z.number().int().min(0).max(100).default(20),
 }).refine((s) => s.openHour < s.closeHour, { message: 'Opening must be before closing', path: ['closeHour'] })
   .refine((s) => s.emergencyStartHour < s.emergencyEndHour, { message: 'Emergency start must be before its end', path: ['emergencyEndHour'] });
 export type Settings = z.infer<typeof settingsSchema>;

export const orderStatusSchema = z.enum(['PLACED', 'CONFIRMED', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED']);
export const adminTransitionSchema = z.object({
  to: orderStatusSchema,
  riderId: z.string().optional(),
  note: z.string().trim().max(300).optional(),
});
export const riderTransitionSchema = z.object({
  to: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED']),
  note: z.string().trim().max(300).optional(),
  /** The customer's 4-digit handover code, required to mark an order delivered. */
  code: z.string().regex(/^\d{4}$/).optional(),
});
export const riderOnlineSchema = z.object({ online: z.boolean() });
/** A rider accepts an assigned job or hands it back to the pharmacy. */
export const riderRespondSchema = z.object({
  accept: z.boolean(),
  reason: z.string().trim().max(300).optional(),
}).refine((r) => r.accept || !!r.reason, { message: 'Say why you are declining', path: ['reason'] });
export const rateOrderSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().trim().max(500).optional(),
});
export const staffSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(1).max(80),
  role: z.enum(['ADMIN', 'RIDER']),
});
export const staffActiveSchema = z.object({ isActive: z.boolean() });
export const consultationChannelSchema = z.enum(['GOOGLE_MEET', 'WHATSAPP']);
/** Interns (MBBS, on duty) take instant video calls; specialists take booked slots. */
export const doctorTierSchema = z.enum(['SPECIALIST', 'INTERN']);
export const doctorDutySchema = z.object({ onDuty: z.boolean() });
/** A customer asks for a doctor now: the next free on-duty intern takes the call. */
export const instantConsultSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  patientPhone: phoneSchema.optional(),
});
/** A doctor takes or turns down a paid consultation. */
export const consultationRespondSchema = z.object({
  accept: z.boolean(),
  reason: z.string().trim().max(300).optional(),
});
export const doctorSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(1).max(80),
  bmdcNo: z.string().trim().min(1).max(30),
  specialty: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(1000).default(''),
  feePoisha: z.number().int().min(0).optional(),
  tier: doctorTierSchema.default('SPECIALIST'),
  channels: z.array(consultationChannelSchema).min(1),
  meetLink: z.url().startsWith('https://').optional(),
  whatsapp: phoneSchema.optional(),
}).refine((d) => !d.channels.includes('GOOGLE_MEET') || !!d.meetLink, { message: 'Add a Google Meet link', path: ['meetLink'] })
  .refine((d) => !d.channels.includes('WHATSAPP') || !!d.whatsapp, { message: 'Add a WhatsApp number', path: ['whatsapp'] });
export const availabilitySchema = z.object({
  windows: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    slotMinutes: z.number().int().min(10).max(120),
  }).refine((w) => w.startMinute < w.endMinute, { message: 'Start must be before end' })).max(50),
});
/** Specialists keep 2-4 hours a day for patients, on every day they consult. */
export const SPECIALIST_DAILY_MINUTES = { min: 120, max: 240 } as const;
export function dailyMinutes(windows: { weekday: number; startMinute: number; endMinute: number }[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const w of windows) m.set(w.weekday, (m.get(w.weekday) ?? 0) + (w.endMinute - w.startMinute));
  return m;
}
export const bookConsultationSchema = z.object({
  doctorId: z.string().min(1),
  startsAt: z.iso.datetime(),
  channel: consultationChannelSchema,
  reason: z.string().trim().max(500).optional(),
  patientPhone: phoneSchema.optional(),
});
export const prescriptionItemSchema = z.object({
  medicine: z.string().trim().min(1).max(160),
  /** Set when the doctor picked the medicine from the pharmacy catalogue, so the patient can order exactly it. */
  medicineId: z.string().min(1).max(40).optional(),
  dose: z.string().trim().max(60).default(''),
  /** e.g. 1+0+1 — morning, noon, night. */
  frequency: z.string().trim().max(40).default(''),
  days: z.number().int().min(0).max(365).default(0),
  instructions: z.string().trim().max(200).default(''),
});
export const ePrescriptionSchema = z.object({
  diagnosis: z.string().trim().max(300).default(''),
  items: z.array(prescriptionItemSchema).max(20).default([]),
  advice: z.string().trim().max(1000).default(''),
  followUpDays: z.number().int().min(0).max(365).default(0),
});
export type EPrescription = z.infer<typeof ePrescriptionSchema>;
export const consultationStatusSchema = z.object({
  status: z.enum(['COMPLETED', 'NO_SHOW']),
  notes: z.string().trim().max(2000).optional(),
  prescription: ePrescriptionSchema.optional(),
});
/** What the doctor controls about their public profile. BMDC, specialty, fee and call types stay with admins. */
export const doctorProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(1000).default(''),
  meetLink: z.union([z.literal(''), z.url().startsWith('https://')]).default(''),
  whatsapp: z.union([z.literal(''), phoneSchema]).default(''),
  photoUrl: z.union([z.literal(''), z.url().startsWith('https://'), z.url().startsWith('http://localhost')]).optional(),
  qualifications: z.string().trim().max(160).optional(),
  experienceYears: z.number().int().min(0).max(70).optional(),
  workplace: z.string().trim().max(120).optional(),
  languages: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
});

/** A superadmin invites a doctor by email; the doctor finishes their own account from the link. */
export const doctorInviteSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2).max(80),
  bmdcNo: z.string().trim().min(1).max(30),
  specialty: z.string().trim().min(1).max(80),
  feePoisha: z.number().int().min(0).max(10_000_000).optional(),
  tier: doctorTierSchema.default('SPECIALIST'),
  channels: z.array(consultationChannelSchema).min(1),
});
export const doctorInviteOtpSchema = z.object({ phone: phoneSchema });
export const doctorInviteAcceptSchema = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) });
/** Admin edits to a doctor's listing. */
export const doctorAdminUpdateSchema = z.object({
  specialty: z.string().trim().min(1).max(80).optional(),
  feePoisha: z.number().int().min(0).max(10_000_000).nullable().optional(),
  channels: z.array(consultationChannelSchema).min(1).optional(),
  tier: doctorTierSchema.optional(),
});
export const paymentStartSchema = z.object({
  purpose: z.enum(['ORDER', 'CONSULTATION']),
  refId: z.string().min(1),
});
export const prescriptionUploadSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
});
export const productImageUploadSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});
export const settleSchema = z.object({ amountPoisha: z.number().int().min(1), note: z.string().trim().max(200).optional() });


export const writeOffSchema = z.object({ qty: z.number().int().min(1).max(1_000_000), reason: z.string().trim().min(1).max(200) });
