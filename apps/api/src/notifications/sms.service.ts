import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ENV, type Env } from '../config/env.js';

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

/** Swappable gateway. `http` posts JSON; adapt the body when the SMS provider is chosen. */
export async function deliverSms(env: Env, job: SmsJob, log: Logger): Promise<void> {
  if (env.SMS_PROVIDER === 'console') {
    log.log(`[dev SMS] to ${job.to}: ${job.text}`);
    return;
  }
  const res = await fetch(env.SMS_HTTP_URL!, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SMS_HTTP_TOKEN}` },
    body: JSON.stringify({ to: job.to, message: job.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`SMS gateway returned ${res.status}`);
}
