import { expect, type Page } from '@playwright/test';

/** A fresh throwaway account per test so specs never collide on data. */
export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const TEST_PASSWORD = 'e2e-password-123';

/**
 * Register a new user and land on the signed-in dashboard.
 *
 * The very first request after Playwright cold-spawns the servers can fail
 * (fresh Neon connection + scrypt on an unwarmed API shows the gate's
 * "Something went wrong") — one retry absorbs that without masking real
 * failures: a genuine error fails again immediately.
 */
export async function register(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: /Need an account/ }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  const signedIn = page.locator('.sidebar-user-name');
  const gateError = page.locator('.gate-shell .error');
  await expect(signedIn.or(gateError).first()).toBeVisible({ timeout: 15_000 });
  if (await gateError.isVisible().catch(() => false)) {
    // Cold-start hiccup — the account may or may not exist now; a fresh email
    // sidesteps "already registered" either way.
    const retryEmail = uniqueEmail();
    await page.getByLabel('Email').fill(retryEmail);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.sidebar-user-name')).toHaveText(retryEmail, { timeout: 15_000 });
    return retryEmail;
  }
  await expect(signedIn).toHaveText(email);
  return email;
}
