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
export const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40),
  line: z.string().trim().min(3).max(200),
  zoneId: z.string().min(1),
  phone: phoneSchema,
  notes: z.string().trim().max(200).optional(),
});

export const placeOrderSchema = z.object({
  idempotencyKey: z.string().min(8).max(64),
  addressId: z.string().min(1),
  type: z.enum(['NORMAL', 'EMERGENCY']),
  slotStart: z.iso.datetime().optional(),
  paymentMethod: z.enum(['COD', 'BKASH']),
  prescriptionKey: z.string().max(200).optional(),
  notes: z.string().trim().max(300).optional(),
  items: z.array(z.object({ medicineId: z.string().min(1), qty: z.number().int().min(1).max(50) })).min(1).max(50),
}).refine((o) => o.type === 'EMERGENCY' || !!o.slotStart, { message: 'Choose a delivery time', path: ['slotStart'] });

export const medicineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  genericName: z.string().trim().min(1).max(160),
  manufacturer: z.string().trim().max(120).default(''),
  form: z.string().trim().min(1).max(40),
  strength: z.string().trim().max(40).default(''),
  packSize: z.string().trim().max(40).default(''),
  pricePoisha: z.number().int().min(0).max(100_000_000),
  isRx: z.boolean().default(false),
  isActive: z.boolean().default(true),
  categoryId: z.string().min(1),
  description: z.string().trim().max(2000).default(''),
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
});
export const staffSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(1).max(80),
  role: z.enum(['ADMIN', 'RIDER']),
});
export const consultationChannelSchema = z.enum(['GOOGLE_MEET', 'WHATSAPP']);
export const doctorSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(1).max(80),
  bmdcNo: z.string().trim().min(1).max(30),
  specialty: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(1000).default(''),
  feePoisha: z.number().int().min(0).optional(),
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
export const bookConsultationSchema = z.object({
  doctorId: z.string().min(1),
  startsAt: z.iso.datetime(),
  channel: consultationChannelSchema,
  reason: z.string().trim().max(500).optional(),
  patientPhone: phoneSchema.optional(),
});
export const consultationStatusSchema = z.object({
  status: z.enum(['COMPLETED', 'NO_SHOW']),
  notes: z.string().trim().max(2000).optional(),
});
export const paymentStartSchema = z.object({
  purpose: z.enum(['ORDER', 'CONSULTATION']),
  refId: z.string().min(1),
});
export const prescriptionUploadSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
});
export const settleSchema = z.object({ amountPoisha: z.number().int().min(1), note: z.string().trim().max(200).optional() });
