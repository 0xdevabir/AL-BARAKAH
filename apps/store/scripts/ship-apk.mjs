#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = join(root, '../api');
const api = process.env.PUBLIC_API_URL;
const storeUrl = (process.env.PUBLIC_STORE_URL || process.env.STORE_URL || '').replace(/\/$/, '');
if (!api) {
  console.error('Set PUBLIC_API_URL to the API the phone can reach, e.g. http://192.168.0.158:4000');
  process.exit(1);
}

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, env: process.env, shell: opts.shell, ...opts });
  if (r.status) process.exit(r.status ?? 1);
};

/** Bump Android versionCode (+1) and patch versionName so every ship is newer than phones in the field. */
function bumpAndroidVersion() {
  const gradle = join(root, 'android/app/build.gradle');
  let text = readFileSync(gradle, 'utf8');
  const codeMatch = text.match(/versionCode\s+(\d+)/);
  const nameMatch = text.match(/versionName\s+"([^"]+)"/);
  if (!codeMatch || !nameMatch) {
    console.error('Could not find versionCode/versionName in android/app/build.gradle');
    process.exit(1);
  }
  const versionCode = Number(codeMatch[1]) + 1;
  const parts = nameMatch[1].split('.').map((n) => Number(n));
  while (parts.length < 3) parts.push(0);
  parts[2] = (Number.isFinite(parts[2]) ? parts[2] : 0) + 1;
  const versionName = parts.join('.');
  text = text
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
  writeFileSync(gradle, text);

  const release = {
    androidLatestVersionCode: versionCode,
    androidLatestVersionName: versionName,
    androidApkUrl: storeUrl ? `${storeUrl}/download/al-barakah.apk` : '',
    androidForceUpdate: false,
    androidUpdateNotes: '',
  };
  writeFileSync(join(apiRoot, 'android-release.json'), `${JSON.stringify(release, null, 2)}\n`);
  console.log(`Android version → ${versionName} (${versionCode})`);
  return release;
}

const release = bumpAndroidVersion();

console.log('Building mobile web bundle →', api);
run('pnpm', ['run', 'build:mobile'], { env: { ...process.env, PUBLIC_API_URL: api } });

console.log('Syncing Capacitor android…');
run('pnpm', ['exec', 'cap', 'sync', 'android']);

const javaHome = process.env.JAVA_HOME
  || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
console.log('Assembling debug APK…');
run('./gradlew', ['assembleDebug'], {
  cwd: join(root, 'android'),
  env: { ...process.env, JAVA_HOME: javaHome },
});

const built = join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(built)) {
  console.error('APK missing at', built);
  process.exit(1);
}
const outDir = join(root, 'apk');
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, 'AL-BARAKAH.apk');
cpSync(built, dest);
const mb = (statSync(dest).size / (1024 * 1024)).toFixed(2);
console.log(`Shipped ${dest} (${mb} MB) — /download/al-barakah.apk serves this file.`);
console.log(`Update check: phones below versionCode ${release.androidLatestVersionCode} will see the update sheet.`);
if (!storeUrl) {
  console.log('Tip: set PUBLIC_STORE_URL (or STORE_URL) so the popup opens the right APK link.');
}
