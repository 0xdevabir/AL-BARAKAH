import { z } from 'zod';

const secret = z.string().min(32);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_ROLE: z.enum(['api', 'worker', 'all']).default('all'),
  // Per address. Generous because many Bangladeshi mobile users share one carrier address.
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(1200),
  // One-tap sign-in to the seeded demo accounts, for testing. Refused in production below.
  DEMO_LOGIN: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_PORT: z.coerce.number().int(),
  S3_USE_SSL: z.stringbool().default(false),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  /** Address phones use for signed file links, such as https://files.example.com. Defaults to the internal one. */
  S3_PUBLIC_URL: z.url().optional(),
  JWT_SECRET: secret,
  OTP_PEPPER: secret,
  TOTP_ENCRYPTION_KEY: secret,
  CORS_ORIGINS: z.string().transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  PUBLIC_API_BASE: z.url(),
  STORE_URL: z.url(),
  SMS_PROVIDER: z.enum(['console', 'alphasms']).default('console'),
  SMS_API_KEY: z.string().optional(),
  /** Only if Alpha SMS has approved one; otherwise leave empty and their default is used. */
  SMS_SENDER_ID: z.string().optional(),
  BKASH_MODE: z.enum(['fake', 'sandbox', 'live']).default('fake'),
  BKASH_APP_KEY: z.string().optional(),
  BKASH_APP_SECRET: z.string().optional(),
  BKASH_USERNAME: z.string().optional(),
  BKASH_PASSWORD: z.string().optional(),
}).superRefine((e, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (e.NODE_ENV === 'production') {
    // These would each let someone log in or get free goods if they reached production.
    if (e.DEMO_LOGIN) fail('DEMO_LOGIN is not allowed in production');
    if (e.BKASH_MODE === 'fake') fail('BKASH_MODE=fake is not allowed in production');
    if (e.SMS_PROVIDER === 'console') fail('SMS_PROVIDER=console is not allowed in production');
    if (e.CORS_ORIGINS.includes('*')) fail('CORS_ORIGINS must not contain * in production');
  }
  if (e.BKASH_MODE !== 'fake' && !(e.BKASH_APP_KEY && e.BKASH_APP_SECRET && e.BKASH_USERNAME && e.BKASH_PASSWORD)) {
    fail('bKash credentials are required unless BKASH_MODE=fake');
  }
  if (e.SMS_PROVIDER === 'alphasms' && !e.SMS_API_KEY) fail('SMS_API_KEY is required when SMS_PROVIDER=alphasms');
});

export type Env = z.infer<typeof schema>;

/** Fails at boot, listing every problem, instead of failing later on a customer's request. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
