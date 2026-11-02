import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, UnrecoverableError } from 'bullmq';
import { ENV, type Env } from '../config/env.js';
import { AlphaSmsError, sendAlphaSms } from './alpha-sms.js';

export const SMS_QUEUE = 'sms';
export interface SmsJob { to: string; text: string }

export function bullConnection(redisUrl: string) {
  const u = new URL(redisUrl);
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, maxRetriesPerRequest: null };
}

/** Queues messages so a slow SMS gateway never holds up a customer's request. */
@Injectable()
export class SmsService implements OnModuleDestroy {
  private readonly queue: Queue<SmsJob>;

  constructor(@Inject(ENV) env: Env) {
    this.queue = new Queue<SmsJob>(SMS_QUEUE, { connection: bullConnection(env.REDIS_URL) });
  }

  send(to: string, text: string) {
    return this.queue.add('send', { to, text }, {
      attempts: 4,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
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
    const requestId = await sendAlphaSms({ apiKey: env.SMS_API_KEY!, senderId: env.SMS_SENDER_ID, to: job.to, message: job.text });
    log.log(`SMS accepted by gateway, request ${requestId}`);
  } catch (err) {
    if (err instanceof AlphaSmsError && !err.retryable) throw new UnrecoverableError(err.message);
    throw err;
  }
}
