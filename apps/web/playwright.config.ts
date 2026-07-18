import { defineConfig, devices } from '@playwright/test';

// Full-stack e2e: drives the real web app against a real API + Postgres.
// Locally the webServer entries boot the built API + web (reusing any already
// running); CI starts them itself against an ephemeral pgvector container.
// Set E2E_NO_SERVER=1 to run specs against servers you started yourself.
const WEB_PORT = 3000;
const API_HEALTH = 'http://localhost:4000/health';
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : [
        {
          command: 'pnpm --filter @atlas/api start',
          url: API_HEALTH,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: 'pnpm --filter @atlas/web start',
          url: `http://localhost:${WEB_PORT}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
