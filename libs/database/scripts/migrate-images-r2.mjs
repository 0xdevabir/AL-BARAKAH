#!/usr/bin/env node
/**
 * Copies every product photo that still points at an outside host into the public images bucket
 * (Cloudflare R2 or any S3 service), then repoints Medicine.imageUrl at the copy.
 *
 *   node --env-file=../../.env scripts/migrate-images-r2.mjs [--dry] [--limit=N] [--concurrency=N]
 *
 * Safe to re-run: keys are the SHA-256 of the file, so a photo shared by many medicines is stored once,
 * finished URLs are remembered in data/r2-images-state.json, and a row only changes after its copy
 * has been confirmed at the public address. Anything that fails keeps its old URL and is listed at the end.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const DRY = !!args.dry;
const LIMIT = Number(args.limit) || Infinity;
const CONCURRENCY = Number(args.concurrency) || 12;
const MAX_BYTES = 15 * 1024 * 1024;
const STATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'r2-images-state.json');

const need = (k) => process.env[k] || (console.error(`Missing ${k} in the environment`), process.exit(1));
const BUCKET = need('S3_IMAGES_BUCKET');
const PUBLIC = need('S3_IMAGES_PUBLIC_URL').replace(/\/$/, '');
const endpoint = process.env.S3_URL ?? `${process.env.S3_USE_SSL === 'true' ? 'https' : 'http'}://${need('S3_ENDPOINT')}:${need('S3_PORT')}`;
const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId: need('S3_ACCESS_KEY'), secretAccessKey: need('S3_SECRET_KEY') },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

/** The bytes decide the type: hosts often label WebP or PNG files as image/jpeg. */
function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['image/jpeg', 'jpg'];
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ['image/png', 'png'];
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return ['image/webp', 'webp'];
  if (b.toString('ascii', 0, 4) === 'GIF8') return ['image/gif', 'gif'];
  if (b.toString('ascii', 4, 12) === 'ftypavif') return ['image/avif', 'avif'];
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(what, fn, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.permanent || i >= tries) throw err;
      await sleep(500 * 2 ** i + Math.random() * 300);
    }
  }
}

async function download(url) {
  return withRetry(url, async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'albarakah-image-migration/1.0' } });
    if (res.status === 404 || res.status === 410) throw Object.assign(new Error(`HTTP ${res.status}`), { permanent: true });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0) throw Object.assign(new Error('empty file'), { permanent: true });
    if (body.length > MAX_BYTES) throw Object.assign(new Error(`too large (${body.length} bytes)`), { permanent: true });
    const type = sniff(body);
    if (!type) throw Object.assign(new Error(`not an image (${res.headers.get('content-type')})`), { permanent: true });
    return { body, type };
  });
}

async function upload({ body, type: [contentType, ext] }) {
  const key = `products/${createHash('sha256').update(body).digest('hex').slice(0, 40)}.${ext}`;
  const existing = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => null);
  if (existing?.ContentLength !== body.length) {
    await withRetry(key, () => s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable',
    })));
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    if (head.ContentLength !== body.length) throw new Error(`stored size ${head.ContentLength} != ${body.length}`);
  }
  const publicUrl = `${PUBLIC}/${key}`;
  // What customers will load: it must answer with the same bytes, not just exist in the bucket.
  await withRetry(publicUrl, async () => {
    const res = await fetch(publicUrl, { signal: AbortSignal.timeout(30_000) });
    const got = Buffer.from(await res.arrayBuffer());
    if (!res.ok || !got.equals(body)) throw new Error(`public URL check failed (HTTP ${res.status}, ${got.length} bytes)`);
  });
  return publicUrl;
}

async function main() {
  const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { done: {}, failed: {} };
  const save = () => writeFileSync(STATE, JSON.stringify(state, null, 1));

  const db = new pg.Client({ connectionString: need('DATABASE_URL') });
  await db.connect();
  const { rows } = await db.query(
    `SELECT "imageUrl" AS url, COUNT(*)::int AS n FROM "Medicine" WHERE "imageUrl" <> '' AND "imageUrl" NOT LIKE $1 GROUP BY 1 ORDER BY 2 DESC`,
    [`${PUBLIC}/%`],
  );
  const todo = rows.slice(0, LIMIT);
  const total = await db.query(`SELECT COUNT(*)::int AS n FROM "Medicine" WHERE "imageUrl" <> ''`);
  console.log(`${total.rows[0].n} medicines have a photo; ${rows.length} distinct outside URLs (${rows.reduce((s, r) => s + r.n, 0)} medicines) to move.`);
  if (DRY) return db.end();

  let next = 0, ok = 0, failed = 0, rowsUpdated = 0;
  const started = Date.now();
  async function worker() {
    while (next < todo.length) {
      const { url } = todo[next++];
      try {
        const publicUrl = state.done[url] ?? (await upload(await download(url)));
        const r = await db.query(`UPDATE "Medicine" SET "imageUrl" = $2, "updatedAt" = NOW() WHERE "imageUrl" = $1`, [url, publicUrl]);
        state.done[url] = publicUrl;
        delete state.failed[url];
        rowsUpdated += r.rowCount;
        ok++;
      } catch (err) {
        state.failed[url] = String(err.message ?? err);
        failed++;
      }
      const n = ok + failed;
      if (n % 50 === 0 || n === todo.length) {
        save();
        const rate = n / ((Date.now() - started) / 1000);
        console.log(`${n}/${todo.length}  ok ${ok}  failed ${failed}  rows ${rowsUpdated}  ~${Math.round((todo.length - n) / rate)}s left`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  save();

  const left = await db.query(`SELECT COUNT(*)::int AS n FROM "Medicine" WHERE "imageUrl" <> '' AND "imageUrl" NOT LIKE $1`, [`${PUBLIC}/%`]);
  await db.end();
  console.log(`\nDone. Moved ${ok} files, repointed ${rowsUpdated} medicines. ${left.rows[0].n} medicines still use an outside URL.`);
  const reasons = {};
  for (const why of Object.values(state.failed)) reasons[why] = (reasons[why] ?? 0) + 1;
  if (failed) console.log('Failures by reason:', reasons, `\nFull list: ${STATE} ("failed"). Re-run to retry them.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
