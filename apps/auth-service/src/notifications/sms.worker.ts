import { Inject, Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import { ENV, type Env } from '@albarakah/nest-common';
import { bullConnection, deliverSms, SMS_QUEUE, type SmsJob } from './sms.service.js';

/** Consumes the SMS queue so OTP send never blocks the auth request path. */
@Injectable()
export class SmsWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('SmsWorker');
  private worker?: Worker;

  constructor(@Inject(ENV) private readonly env: Env) {}

  onModuleInit() {
    this.worker = new Worker<SmsJob>(
      SMS_QUEUE,
      (job: Job<SmsJob>) => deliverSms(this.env, job.data, this.log),
      { connection: bullConnection(this.env.REDIS_URL), concurrency: 5 },
    );
    this.worker.on('failed', (job, err) => this.log.error(`sms/${job?.name} failed: ${err.message}`));
  }

  onModuleDestroy() {
    return this.worker?.close();
  }
}

@Module({ providers: [SmsWorkerService] })
export class SmsWorkerModule {}
