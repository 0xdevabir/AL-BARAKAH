import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Module, type OnModuleInit, Logger } from '@nestjs/common';
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { conflict, ENV, type Env } from '@albarakah/nest-common';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/**
 * Any S3-compatible service: the bundled SeaweedFS locally, or Cloudflare R2 / AWS S3 via S3_URL.
 * Prescriptions live in the private S3_BUCKET and are only reachable through short signed links.
 * Product photos, when S3_IMAGES_BUCKET is set, live in a public bucket and are linked directly.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly s3: S3Client;
  private readonly signer: S3Client;
  private readonly log = new Logger('Storage');

  constructor(@Inject(ENV) private readonly env: Env) {
    const client = (endpoint: string) => new S3Client({
      region: env.S3_REGION,
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
      // Otherwise the SDK signs a checksum of an empty body into the URL, and real uploads are rejected.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    const internal = env.S3_URL ?? `${env.S3_USE_SSL ? 'https' : 'http'}://${env.S3_ENDPOINT}:${env.S3_PORT}`;
    this.s3 = client(internal);
    // The host is part of the signature, so URLs given to phones must be signed for the public address.
    // With R2 leave S3_PUBLIC_URL unset: its API address is already public, and custom domains reject signed links.
    this.signer = client(env.S3_PUBLIC_URL ?? internal);
  }

  async onModuleInit() {
    for (const bucket of [this.env.S3_BUCKET, this.env.S3_IMAGES_BUCKET]) {
      if (!bucket) continue;
      try {
        await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        // Hosted services usually give object-only keys; create the bucket in their dashboard instead.
        await this.s3.send(new CreateBucketCommand({ Bucket: bucket })).catch((err) => this.log.error(`Bucket ${bucket} is missing and could not be created: ${err}`));
      }
    }
  }

  /** The key is scoped to the user, which is what lets order placement reject someone else's file. */
  async prescriptionUploadUrl(userId: string, contentType: string) {
    const key = `rx/${userId}/${randomUUID()}.${EXT[contentType]}`;
    const url = await getSignedUrl(this.signer, new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 300 });
    return { key, url };
  }

  signedReadUrl(key: string) {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }), { expiresIn: 120 });
  }

  /** A signed upload into the public images bucket, plus the permanent address to save on the medicine. */
  async productImageUploadUrl(contentType: string) {
    const { S3_IMAGES_BUCKET: bucket, S3_IMAGES_PUBLIC_URL: base } = this.env;
    if (!bucket || !base) throw conflict('IMAGES_NOT_CONFIGURED', 'Image uploads are not set up. Paste an image link instead.');
    const key = `products/${randomUUID()}.${EXT[contentType]}`;
    const url = await getSignedUrl(
      this.signer,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }),
      { expiresIn: 300 },
    );
    return { url, publicUrl: `${base.replace(/\/$/, '')}/${key}` };
  }
}

@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
