#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = process.env.PUBLIC_API_URL;
if (!api) {
  console.error('Set PUBLIC_API_URL to the API the phone can reach, e.g. http://192.168.0.158:4000');
  process.exit(1);
}

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, env: process.env, shell: opts.shell, ...opts });
  if (r.status) process.exit(r.status ?? 1);
};

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
console.log(`Shipped ${dest} (${mb} MB) — Play badge /download/al-barakah.apk serves this file.`);
