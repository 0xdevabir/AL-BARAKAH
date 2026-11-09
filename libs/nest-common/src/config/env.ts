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
  /**
   * Full S3 API address for a hosted service such as Cloudflare R2
   * (https://<account id>.r2.cloudflarestorage.com). When set it replaces S3_ENDPOINT, S3_PORT and S3_USE_SSL.
   */
  S3_URL: z.url().optional(),
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_PORT: z.coerce.number().int().optional(),
  S3_USE_SSL: z.stringbool().default(false),
  /** R2 uses `auto`. */
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  /** Address phones use for signed file links, such as https://files.example.com. Defaults to the internal one. */
  S3_PUBLIC_URL: z.url().optional(),
  /** Public bucket for product photos that staff upload. Optional; without it staff paste image links. */
  S3_IMAGES_BUCKET: z.string().min(1).optional(),
  /** Public address of that bucket: an R2 custom domain such as https://images.example.com, or its r2.dev URL. */
  S3_IMAGES_PUBLIC_URL: z.url().optional(),
  JWT_SECRET: secret,
  OTP_PEPPER: secret,
  TOTP_ENCRYPTION_KEY: secret,
  CORS_ORIGINS: z.string().transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  PUBLIC_API_BASE: z.url(),
  STORE_URL: z.url(),
  /** Staff portal address, used in doctor invitation links. */
  STAFF_URL: z.url().default('http://localhost:3001'),
  SMS_PROVIDER: z.enum(['console', 'bulksmsbd']).default('console'),
  SMS_API_KEY: z.string().optional(),
  /** The sender ID approved on the BulkSMSBD account. */
  SMS_SENDER_ID: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
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
  if (!e.S3_URL && !(e.S3_ENDPOINT && e.S3_PORT)) fail('Set S3_URL, or both S3_ENDPOINT and S3_PORT');
  if (!!e.S3_IMAGES_BUCKET !== !!e.S3_IMAGES_PUBLIC_URL) fail('S3_IMAGES_BUCKET and S3_IMAGES_PUBLIC_URL must be set together');
  if (e.BKASH_MODE !== 'fake' && !(e.BKASH_APP_KEY && e.BKASH_APP_SECRET && e.BKASH_USERNAME && e.BKASH_PASSWORD)) {
    fail('bKash credentials are required unless BKASH_MODE=fake');
  }
  if (e.SMS_PROVIDER === 'bulksmsbd' && !(e.SMS_API_KEY && e.SMS_SENDER_ID)) fail('SMS_API_KEY and SMS_SENDER_ID are required when SMS_PROVIDER=bulksmsbd');
  if (e.EMAIL_PROVIDER === 'smtp' && !(e.SMTP_HOST && e.SMTP_PORT && e.EMAIL_FROM)) {
    fail('SMTP_HOST, SMTP_PORT and EMAIL_FROM are required when EMAIL_PROVIDER=smtp');
  }
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
