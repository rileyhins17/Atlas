import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { register, TEST_PASSWORD } from './helpers';

/**
 * Core auth + CRUD happy paths. Registration is throttled 5/min/IP server-side,
 * so this file registers as little as possible: one shared account for the data
 * tests (via storage state), plus one throwaway account for the sign-out/sign-in
 * cycle (which destroys its own session, so it can't share). Keeps the whole
 * suite comfortably under the throttle when run alongside the other specs.
 */

const STATE = 'test-results/.happy-path-state.json';

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: undefined });
  await register(page);
  await page.context().storageState({ path: STATE });
  await page.close();
});

/** Navigate and wait for the signed-in shell. */
async function go(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.sidebar-user-name')).toBeVisible();
}

test('register, sign out, and sign back in', async ({ browser }) => {
  // Its own fresh session: signing out invalidates it, so it can't share state.
  const page = await browser.newPage({ storageState: undefined });
  const email = await register(page);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.sidebar-user-name')).toHaveText(email);
  await page.close();
});

test.describe('with a shared account', () => {
  test.use({ storageState: STATE });

  test('add a task and complete it', async ({ page }) => {
    await go(page, '/tasks');

    await page.getByLabel('New task title').fill('Ship the e2e suite');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Ship the e2e suite')).toBeVisible();

    // Completing moves it under the Done heading.
    await page.getByRole('button', { name: 'Complete "Ship the e2e suite"' }).click();
    await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible();
  });

  test('add a habit and check in for a streak', async ({ page }) => {
    await go(page, '/habits');

    await page.getByLabel('New habit name').fill('Read');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Read')).toBeVisible();

    await page.getByRole('button', { name: 'Check in "Read"' }).click();
    await expect(page.getByLabel('1 day streak')).toBeVisible();
  });

  test('the stream has no serious accessibility violations', async ({ page }) => {
    await go(page, '/today');
    // The stream is data-driven — wait for the now-strip AND a feed row so the
    // scan deterministically covers the feed (the task/habit added above land
    // there), not just the strip.
    await expect(page.locator('.nowstrip')).toBeVisible();
    await expect(page.locator('.feed-row').first()).toBeVisible();

    // Freeze entrance/hover animations so contrast is measured at rest, not on
    // text mid-fade (axe reads the composited opacity otherwise).
    await page.addStyleTag({
      content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
    });

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    // Surface any offenders in the failure message.
    expect(serious, JSON.stringify(serious.map((v) => v.id), null, 2)).toEqual([]);
  });
});
