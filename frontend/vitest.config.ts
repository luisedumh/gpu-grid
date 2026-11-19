import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Unit tests run in Node with jsdom, a browser simulated in memory
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
