import { defineConfig } from 'vitest/config';

// Tests run against the compiled API (dist): esbuild cannot emit the decorator metadata Nest needs.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], globalSetup: ['test/global-setup.ts'], testTimeout: 30_000, hookTimeout: 60_000 },
});
