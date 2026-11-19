import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: a real browser uses the whole application
 * (frontend + backend + database + nvcc compiler, and the agent for @gpu tests).
 */
export default defineConfig({
  testDir: './tests',
  // Compiling with nvcc takes a few seconds, so tests get more time than usual
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // One test at a time: they share the same backend and job queue
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    // When a test fails, keep a trace, a screenshot and a video to see what happened
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Starts the backend and the frontend if they are not already running
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../backend',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      cwd: '../frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
