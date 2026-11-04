import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, UnrecoverableError } from 'bullmq';
import { ENV, type Env } from '@albarakah/nest-common';
import { AppError } from '@albarakah/nest-common';
import { BulkSmsBdError, sendBulkSmsBd } from './bulksmsbd.js';

export const SMS_QUEUE = 'sms';
export interface SmsJob { to: string; text: string }

/** How long OTP/login may wait on Redis before failing clearly instead of hanging. */
const ENQUEUE_MS = 5_000;

export function bullConnection(redisUrl: string) {
  const u = new URL(redisUrl);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
    maxRetriesPerRequest: null,
    connectTimeout: 5_000,
  };
}

/** Queues messages so a slow SMS gateway never holds up a customer's request. */
@Injectable()
export class SmsService implements OnModuleDestroy {
  private readonly queue: Queue<SmsJob>;

  constructor(@Inject(ENV) env: Env) {
    this.queue = new Queue<SmsJob>(SMS_QUEUE, { connection: bullConnection(env.REDIS_URL) });
  }

  async send(to: string, text: string) {
    const job = this.queue.add('send', { to, text }, {
      attempts: 4,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        job,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new AppError(503, 'SMS_UNAVAILABLE', 'Messaging is temporarily unavailable. Please try again in a moment.')),
            ENQUEUE_MS,
          );
        }),
      ]);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, 'SMS_UNAVAILABLE', 'Messaging is temporarily unavailable. Please try again in a moment.');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  onModuleDestroy() {
    return this.queue.close();
  }
}

/** Runs in the worker. Permanent gateway failures skip the remaining attempts; the worker logs the reason. */
export async function deliverSms(env: Env, job: SmsJob, log: Logger): Promise<void> {
  if (env.SMS_PROVIDER === 'console') {
    log.log(`[dev SMS] to ${job.to}: ${job.text}`);
    return;
  }
  try {
    const messageId = await sendBulkSmsBd({ apiKey: env.SMS_API_KEY!, senderId: env.SMS_SENDER_ID!, to: job.to, message: job.text });
    log.log(`SMS accepted by gateway, message ${messageId ?? 'without ID'}`);
  } catch (err) {
    if (err instanceof BulkSmsBdError && !err.retryable) throw new UnrecoverableError(err.message);
    throw err;
  }
}
