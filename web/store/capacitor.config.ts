import type { CapacitorConfig } from '@capacitor/cli';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The app is a native shell around the live store. The Next store has server-rendered
// dynamic pages (/medicine/[slug], /orders/[id], ...), so it can't be exported into the APK;
// loading the site also means web releases reach the app without a new APK.
// Override for staging or a LAN test: MOBILE_APP_URL=http://192.168.1.10:3000 pnpm cap sync android
const url = process.env.MOBILE_APP_URL ?? 'https://barakabari.com';
// The offline page's "Try again" button reads this to go back to the site.
writeFileSync(join(process.cwd(), 'mobile-shell', 'app-url.js'), `window.APP_URL = ${JSON.stringify(url)};\n`);

const config: CapacitorConfig = {
  appId: 'com.barakabari.app',
  appName: 'BarakaBari',
  // Only holds the offline page shown when the site can't be reached.
  webDir: 'mobile-shell',
  server: {
    url,
    cleartext: url.startsWith('http://'),
    errorPath: 'offline.html',
  },
  android: { allowMixedContent: false, backgroundColor: '#F2F8FD' },
};

export default config;
