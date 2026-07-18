import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { register, TEST_PASSWORD, uniqueEmail } from './helpers';

test('register, sign out, and sign back in', async ({ page }) => {
  const email = await register(page);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(`Hi, ${email}`)).toBeVisible();
});

test('add a task and complete it', async ({ page }) => {
  await register(page);

  await page.getByLabel('New task title').fill('Ship the e2e suite');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Ship the e2e suite')).toBeVisible();

  // Completing moves it under the Done heading.
  await page.getByRole('button', { name: 'Complete "Ship the e2e suite"' }).click();
  await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible();
});

test('add a habit and check in for a streak', async ({ page }) => {
  await register(page);

  await page.getByRole('link', { name: 'Habits' }).click();
  await expect(page).toHaveURL(/\/habits$/);

  await page.getByLabel('New habit name').fill('Read');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Read')).toBeVisible();

  await page.getByRole('button', { name: 'Check in "Read"' }).click();
  await expect(page.getByLabel('1 day streak')).toBeVisible();
});

test('dashboard has no serious accessibility violations', async ({ page }) => {
  await register(page);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  // Surface any offenders in the failure message.
  expect(serious, JSON.stringify(serious.map((v) => v.id), null, 2)).toEqual([]);
});
