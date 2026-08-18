/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    // The scoring engine's tests moved to packages/scoring. Web has no unit
    // tests of its own yet (its surface is covered by the smoke scripts), so
    // don't fail `pnpm -r test` on an empty run.
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      // See test/server-only-stub.ts — the real package is resolution-only
      // and cannot load outside a bundler.
      'server-only': resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
});
