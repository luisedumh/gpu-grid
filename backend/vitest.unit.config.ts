import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Unit tests only (tests/unit): no database, so they run in the first phase of the CI
const testEnv = config({ path: '.env.test', override: true, quiet: true }).parsed ?? {};

export default defineConfig({
  test: {
    env: testEnv,
    include: ['tests/unit/**/*.test.ts'],
  },
});
