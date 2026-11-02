import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Module, type OnModuleInit, Logger } from '@nestjs/common';
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ENV, type Env } from '../config/env.js';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly s3: S3Client;
  private readonly log = new Logger('Storage');

  constructor(@Inject(ENV) private readonly env: Env) {
    this.s3 = new S3Client({
      region: 'us-east-1',
      endpoint: `${env.S3_USE_SSL ? 'https' : 'http'}://${env.S3_ENDPOINT}:${env.S3_PORT}`,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  async onModuleInit() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.env.S3_BUCKET })).catch((err) => this.log.error(`Could not create bucket: ${err}`));
    }
  }

  /** The key is scoped to the user, which is what lets order placement reject someone else's file. */
  async prescriptionUploadUrl(userId: string, contentType: string) {
    const key = `rx/${userId}/${randomUUID()}.${EXT[contentType]}`;
    const url = await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 300 });
    return { key, url };
  }

  signedReadUrl(key: string) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }), { expiresIn: 120 });
  }
}

@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
