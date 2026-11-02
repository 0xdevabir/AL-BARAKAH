import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'line',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node start-api.mjs', url: 'http://localhost:4000/health', timeout: 180_000, reuseExistingServer: false },
    { command: 'pnpm --filter @albarakah/store exec vite dev --port 5173 --strictPort', url: 'http://localhost:5173', timeout: 120_000, reuseExistingServer: false },
    { command: 'pnpm --filter @albarakah/staff exec vite dev --port 5174 --strictPort', url: 'http://localhost:5174', timeout: 120_000, reuseExistingServer: false },
  ],
});
