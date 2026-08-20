import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// The API under test loads the repo-root .env, so once sign-up is gated by
// INVITE_CODE the suite has to present the same value or every register() is
// rejected with 403 — which surfaces as a confusing "element not found" when
// the signed-in shell never appears. Read just that one key; nothing else in
// the file is the suite's business.
if (!process.env.INVITE_CODE) {
  try {
    // Playwright loads this config as CommonJS, so import.meta is unavailable.
    const env = readFileSync(resolve(__dirname, '../../.env'), 'utf8');
    const match = /^INVITE_CODE=(.*)$/m.exec(env);
    if (match?.[1]) process.env.INVITE_CODE = match[1].trim();
  } catch {
    // No .env (CI) means sign-up is open, which is what the suite expects.
  }
}

/**
 * Refuse to run against anything that is not a local, throwaway stack.
 *
 * This suite registers roughly thirty accounts per full run and mutates data
 * freely. The repo-root .env is shared by dev and deployment, so it takes one
 * absent-minded moment with production values in it to point the whole suite at
 * Neon and the live site — which would write test accounts into real user data
 * and cannot be undone from here.
 *
 * Both halves are checked because they fail independently: DATABASE_URL decides
 * whose data gets written, E2E_BASE_URL decides whose app gets driven, and
 * either one alone is enough to do damage. Set E2E_ALLOW_REMOTE=1 if you ever
 * genuinely mean it.
 */
function assertLocalTarget(): void {
  if (process.env.E2E_ALLOW_REMOTE) return;

  const isLocal = (value: string): boolean =>
    /(^|@|\/\/)(localhost|127\.0\.0\.1|\[::1\]|db)(:|\/|$)/.test(value);

  let dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl) {
    try {
      const env = readFileSync(resolve(__dirname, '../../.env'), 'utf8');
      dbUrl = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.trim() ?? '';
    } catch {
      // No .env at all means CI, which supplies its own ephemeral container.
    }
  }
  if (dbUrl && !isLocal(dbUrl)) {
    const host = dbUrl.replace(/.*@/, '').replace(/[/?].*/, '');
    throw new Error(
      `Refusing to run e2e against a non-local database (${host}).\n` +
        'This suite registers ~30 accounts and mutates data. Point DATABASE_URL at the ' +
        'local Postgres, or set E2E_ALLOW_REMOTE=1 if you really mean it.',
    );
  }

  const target = process.env.E2E_BASE_URL ?? '';
  if (target && !isLocal(target)) {
    throw new Error(
      `Refusing to run e2e against a non-local app (${target}).\n` +
        'Set E2E_ALLOW_REMOTE=1 if you really mean it.',
    );
  }
}

assertLocalTarget();

// Full-stack e2e: drives the real web app against a real API + Postgres.
// Locally the webServer entries boot the built API + web (reusing any already
// running); CI starts them itself against an ephemeral pgvector container.
// Set E2E_NO_SERVER=1 to run specs against servers you started yourself.
const WEB_PORT = 3000;
const API_HEALTH = 'http://localhost:4000/health';
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // 90s, not 30s: sign-up is throttled 5/min/IP and the register helper waits
  // the window out rather than retrying straight back into a 429. Normal specs
  // finish in 2-6s, so this only ever costs time on a run that would otherwise
  // have collapsed entirely.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    // The app already honours prefers-reduced-motion with a global animation
    // reset; opting into it here makes clicks deterministic. Content animates
    // in on every route change and query resolution, and Playwright's
    // actionability check refuses to click a moving target — which cost two
    // specs that passed alone and flaked in the suite.
    // Under contextOptions, not directly on `use` — it is a browser-context
    // option, and putting it at the top level typechecks nowhere.
    contextOptions: { reducedMotion: 'reduce' },
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
