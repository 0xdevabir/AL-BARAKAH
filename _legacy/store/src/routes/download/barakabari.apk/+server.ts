import { error } from '@sveltejs/kit';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

// The website serves our own package. Android opens the system installer from this file.
// It does not go to the Play Store. Drop a release build at apk/barakabari.apk, or set ANDROID_APK.
function apkPath(): string | undefined {
  const candidates = [
    process.env.ANDROID_APK,
    join(process.cwd(), 'apk/barakabari.apk'),
    join(process.cwd(), 'android/app/build/outputs/apk/release/app-release.apk'),
    join(process.cwd(), 'android/app/build/outputs/apk/debug/app-debug.apk'),
  ].filter((path): path is string => !!path);
  return candidates.find((path) => existsSync(path));
}

export const GET: RequestHandler = () => {
  const file = apkPath();
  if (!file) error(404, 'The Android app file is not on this server yet.');
  const size = statSync(file).size;
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      'content-type': 'application/vnd.android.package-archive',
      'content-length': String(size),
      'content-disposition': 'attachment; filename="barakabari.apk"',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    },
  });
};
