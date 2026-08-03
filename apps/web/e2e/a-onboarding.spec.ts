import { expect, test } from '@playwright/test';
import { register } from './helpers';

/**
 * Onboarding v3: three questions, not eight.
 *
 * The wizard used to collect a name, free-text about-you, goals, context and a
 * habit list before the product had shown anything — eight chances to leave in
 * exchange for data Atlas can ask for later, once it has earned the right to.
 * What survives is the set that cannot wait: sleep and work hours, which are
 * what make Today's free-time calculation correct rather than confidently
 * wrong, and the API key, which is what makes the AI exist at all.
 *
 * Named `a-…` so this file's registration runs FIRST — the register endpoint is
 * throttled to 5/min/IP and this suite sits at the limit.
 */

test('a fresh account onboards in three steps into a routine-backed canvas', async ({ page }) => {
  test.setTimeout(90_000);
  await register(page);

  // Step 1 — sleep. No welcome screen: it asked for a name and gave nothing back.
  await expect(page.getByRole('heading', { name: /When does your day start and end/ })).toBeVisible();
  await page.getByLabel('Bedtime').fill('23:00');
  await page.getByLabel('Wake time').fill('07:00');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2 — the week: a fixed job reveals exact hours.
  await page.getByLabel('Weekday shape').selectOption('office');
  await page.getByLabel('Workday start').fill('09:30');
  await page.getByLabel('Workday end').fill('17:30');
  await page.getByLabel('Exercise time').selectOption('evening');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3 — the API key, named plainly and explained as what powers the AI.
  // No key is entered: skipping must remain a first-class path, because most
  // people will not have one to hand on their first evening.
  await expect(page.getByRole('heading', { name: 'Add your DeepSeek API key' })).toBeVisible();
  await expect(page.getByText(/powers everything intelligent in Atlas/)).toBeVisible();
  // Honest about what skipping costs, rather than "everything still works".
  await expect(page.getByText(/will not brief you, plan for you, or notice anything/)).toBeVisible();
  await page.getByRole('button', { name: 'Build my week' }).click();

  // Lands on the Today overview.
  await expect(page.getByRole('button', { name: /^Today · / })).toBeVisible({ timeout: 20_000 });

  // The work block is asserted through the routine editor, NOT the canvas:
  // onboarding writes Work on weekdays only, so a canvas assertion silently
  // depends on which day the suite happens to run.
  await page.goto('/settings');
  await expect(page.locator('.routine-summary')).toContainText('09:30–17:30');
});
