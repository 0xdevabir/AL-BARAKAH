import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.albarakah.app',
  appName: 'AL-BARAKAH',
  webDir: 'build-mobile',
  // Without this, Android opens https://localhost (no path). SvelteKit then has
  // nothing to match and shows the not-found screen on first launch.
  server: { appStartPath: '/' },
  android: { allowMixedContent: true, backgroundColor: '#f1f1f1' },
};

export default config;


