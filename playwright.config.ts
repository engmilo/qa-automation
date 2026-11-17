import 'dotenv/config';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: null,
    launchOptions: {
      slowMo: 1500,
      args: ['--start-maximized'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        viewport: null,
        launchOptions: {
          slowMo: 1500,
          args: ['--start-maximized'],
        },
      },
    },
  ],
});
