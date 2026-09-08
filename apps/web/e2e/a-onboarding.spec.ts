import { expect, test } from '@playwright/test';
import { register } from './helpers';
import { measureScreen, screenFailures } from './ui-measurements';

// Keep the existing first registration; an additional spec would spend another
// registration under the per-IP throttle. This covers the optional routine path.
test('a fresh account chooses two-step routine setup without a provider', async ({ page }) => {
  test.setTimeout(150_000);
  const problems: string[] = [];
  // Register at desktop width, then drop to a phone for the wizard itself. The
  // register helper waits for `.sidebar-user-name` to be VISIBLE, and the
  // sidebar is display:none below 901px — signing up at 390 hangs on an element
  // that resolves and is deliberately hidden.
  await register(page);
  // The wizard is the first thing a PWA meant for a home screen ever shows, so
  // the width that matters is the phone.
  await page.setViewportSize({ width: 390, height: 844 });

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
    await page.goto('/today');
    await expect(page.getByRole('region', { name: 'Start using Atlas' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.getByRole('button', { name: 'Set up my routine first' }).click();
    await expect(page.getByRole('heading', { name: /When does your day start and end/ })).toBeVisible();
    problems.push(...screenFailures(await measureScreen(page, '/onboarding/sleep', theme)));
    await page.getByLabel('Bedtime').fill('23:00');
    await page.getByLabel('Wake time').fill('07:00');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Weekday shape').selectOption('office');
    await page.getByLabel('Workday start').fill('09:30');
    await page.getByLabel('Workday end').fill('17:30');
    await page.getByLabel('Exercise time').selectOption('evening');
    await expect(page.getByLabel('DeepSeek API key')).toHaveCount(0);
    problems.push(...screenFailures(await measureScreen(page, '/onboarding/week', theme)));
    // The first pass has made no writes, so reload safely measures the other
    // theme. Save the second pass and retain the original persistence checks.
    if (theme === 'dark') await page.getByRole('button', { name: 'Build my week', exact: true }).click();
  }
  expect(problems, problems.join('\n')).toEqual([]);

  // Lands on the Today overview.
  await expect(page.getByRole('button', { name: /^Today · / })).toBeVisible({ timeout: 20_000 });

  // The work block is asserted through the routine editor, NOT the canvas:
  // onboarding writes Work on weekdays only, so a canvas assertion silently
  // depends on which day the suite happens to run.
  await page.goto('/settings');
  await expect(page.locator('.routine-summary')).toContainText('09:30–17:30');
});
