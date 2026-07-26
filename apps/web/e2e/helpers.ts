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
  // "/" is the public landing page now — the sign-in gate lives inside the
  // dashboard shell, so registration has to start from an app route.
  await page.goto('/today');
  await page.getByRole('button', { name: 'Show the create account form' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  // A deployment with INVITE_CODE set closes sign-up, and the field only
  // renders in that case — so fill it when it is there and stay silent when it
  // is not. This keeps one helper working against both an open local API and a
  // gated one, without the suite needing to know which it got.
  const invite = page.getByLabel('Invite code');
  if (await invite.count()) await invite.fill(process.env.INVITE_CODE ?? '');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();

  const signedIn = page.locator('.sidebar-user-name');
  // The redesigned gate renders errors as .gate-error; the old .error class
  // no longer exists, so a failed registration was invisible to the retry and
  // timed out instead of retrying.
  const gateError = page.locator('.gate-error, .gate-shell .error');
  await expect(signedIn.or(gateError).first()).toBeVisible({ timeout: 15_000 });
  if (await gateError.isVisible().catch(() => false)) {
    // Cold-start hiccup — the account may or may not exist now; a fresh email
    // sidesteps "already registered" either way.
    const retryEmail = uniqueEmail();
    await page.getByLabel('Email').fill(retryEmail);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.locator('.sidebar-user-name')).toHaveText(retryEmail, { timeout: 15_000 });
    return retryEmail;
  }
  await expect(signedIn).toHaveText(email);
  return email;
}
