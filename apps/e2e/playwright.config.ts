import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'line',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node start-api.mjs', url: 'http://localhost:4000/gateway/health', timeout: 180_000, reuseExistingServer: false },
    { command: 'pnpm --filter @albarakah/store exec next dev --port 3000', url: 'http://localhost:3000', timeout: 120_000, reuseExistingServer: false },
    { command: 'pnpm --filter @albarakah/staff exec next dev --port 3001', url: 'http://localhost:3001', timeout: 120_000, reuseExistingServer: false },
  ],
});
