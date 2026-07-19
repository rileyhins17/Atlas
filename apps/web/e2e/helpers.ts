import { expect, type Page } from '@playwright/test';

/** A fresh throwaway account per test so specs never collide on data. */
export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const TEST_PASSWORD = 'e2e-password-123';

/** Register a new user and land on the signed-in dashboard. */
export async function register(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: /Need an account/ }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('.sidebar-user-name')).toHaveText(email);
  return email;
}
