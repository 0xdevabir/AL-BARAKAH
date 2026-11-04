import { Inject, Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { ENV, type Env } from '@albarakah/nest-common';
import { ConsultationsModule, ConsultationsService } from '../consultations/consultations.module.js';
import { PaymentsModule, PaymentsService } from '../payments/payments.module.js';

const MAINTENANCE = 'maintenance';

function bullConnection(redisUrl: string) {
  const u = new URL(redisUrl);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
    maxRetriesPerRequest: null,
    connectTimeout: 5_000,
  };
}

/** Runs only when SERVICE_ROLE is worker or all, so background load cannot slow customer requests. */
@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Worker');
  private workers: Worker[] = [];
  private queue?: Queue;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly payments: PaymentsService,
    private readonly consultations: ConsultationsService,
  ) {}

  async onModuleInit() {
    const connection = bullConnection(this.env.REDIS_URL);
    this.queue = new Queue(MAINTENANCE, { connection });
    await this.queue.upsertJobScheduler('reconcile-payments', { every: 5 * 60_000 }, { name: 'reconcile' });
    await this.queue.upsertJobScheduler('release-holds', { every: 60_000 }, { name: 'release-holds' });
    this.workers.push(new Worker(MAINTENANCE, async (job) => {
      if (job.name === 'reconcile') await this.payments.reconcile();
      if (job.name === 'release-holds') await this.consultations.releaseExpiredHolds();
    }, { connection }));
    for (const w of this.workers) w.on('failed', (job, err) => this.log.error(`${w.name}/${job?.name} failed: ${err.message}`));
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
    await this.queue?.close();
  }
}

@Module({ imports: [PaymentsModule, ConsultationsModule], providers: [WorkerService] })
export class WorkerModule {}
