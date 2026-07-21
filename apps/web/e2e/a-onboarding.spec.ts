import { expect, test } from '@playwright/test';
import { register } from './helpers';

/**
 * Onboarding v2: a brand-new account walks the warm form end-to-end and lands
 * on a Day Canvas built from its answers, with the free-text answers stored as
 * pinned notes. Named `a-…` so this file's registration runs FIRST — the
 * register endpoint is throttled to 5/min/IP and this suite sits at the limit.
 */

test('a fresh account onboards through the form into a routine-backed canvas', async ({ page }) => {
  test.setTimeout(90_000);
  await register(page);

  // Step 1 — welcome + name.
  await expect(page.getByRole('heading', { name: /Atlas runs on what it knows/ })).toBeVisible();
  await page.getByLabel('Your name').fill('Riley');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2 — sleep times (real time inputs).
  await page.getByLabel('Bedtime').fill('23:00');
  await page.getByLabel('Wake time').fill('07:00');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3 — the week: fixed job reveals exact hours.
  await page.getByLabel('Weekday shape').selectOption('office');
  await page.getByLabel('Workday start').fill('09:30');
  await page.getByLabel('Workday end').fill('17:30');
  await page.getByLabel('Exercise time').selectOption('evening');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Steps 4–6 — free text becomes pinned notes; one filled, one skipped, one filled.
  await page.getByLabel('About you').fill('E2E person building a life OS.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip' }).click(); // goals
  await page.getByLabel('Anything else').fill('Short scannable plans work best.');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 7 — habits: one seed + one custom, then build.
  await page.getByRole('button', { name: /^Gym$/ }).click();
  await page.getByLabel('Custom habit').fill('Stretch');
  await page.getByRole('button', { name: 'Add habit' }).click();
  await page.getByRole('button', { name: 'Build my week' }).click();

  // Lands on the canvas: pager on Today, the work block from the exact times.
  await expect(page.getByRole('button', { name: /^Today · / })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('9:30 AM – 5:30 PM')).toBeVisible();

  // The free-text answers are pinned notes.
  await page.getByRole('link', { name: 'Notes', exact: true }).click();
  await expect(page.getByText('E2E person building a life OS.')).toBeVisible();
  await expect(page.getByText('Short scannable plans work best.')).toBeVisible();

  // Habits exist (seed + custom).
  await page.getByRole('link', { name: 'Habits', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check in "Gym"' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check in "Stretch"' })).toBeVisible();
});
