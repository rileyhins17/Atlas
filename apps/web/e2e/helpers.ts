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
    // Two different failures land here and they need different treatment.
    //
    // A cold-start hiccup clears immediately, so a fresh email is enough. But
    // sign-up is throttled 5/min/IP, and the suite registers once per spec
    // file — so a re-run soon after a previous one retries straight back into
    // the same 429 and the whole run collapses on the first spec. Waiting out
    // the window is the only thing that actually helps, and a minute of
    // waiting beats a suite that only passes when you have not run it lately.
    const text = (await gateError.textContent()) ?? '';
    if (/too many|429|rate/i.test(text)) await page.waitForTimeout(61_000);

    const retryEmail = uniqueEmail();
    await page.getByLabel('Email').fill(retryEmail);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.locator('.sidebar-user-name')).toHaveText(retryEmail, { timeout: 20_000 });
    return retryEmail;
  }
  await expect(signedIn).toHaveText(email);
  return email;
}

/**
 * Put the shared user's fitness state back to a known baseline.
 *
 * These specs deliberately share one registered account — sign-up is throttled
 * 5/min/IP, so a spec-per-user suite rate-limits itself. The cost is that state
 * bleeds: one spec leaves a session open, and the next finds the start card
 * (and every control on it) conditionally absent. Guarding inside each spec was
 * not enough, because "is there an open workout" is only one of the things that
 * can differ.
 *
 * Runs in the page so it inherits the session cookie, and hits the same API the
 * UI does rather than reaching into the database.
 */
export async function resetFitness(page: Page): Promise<void> {
  // Must be on an app origin for a same-origin credentialed fetch to carry the
  // session cookie.
  if (!page.url().startsWith('http')) await page.goto('/today');

  await page.evaluate(async () => {
    const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : '/api';
    const get = (path: string) => fetch(`${base}${path}`, { credentials: 'include' });

    // A workout left open hides the whole start card.
    const activeRes = await get('/fitness/workouts/active');
    const activeText = await activeRes.text();
    if (activeText.length > 0) {
      const active = JSON.parse(activeText) as { id: string } | null;
      if (active?.id) {
        await fetch(`${base}/fitness/workouts/${active.id}/finish`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
      }
    }

    // Saved days change which chips render and what the picker prioritises.
    const templates = (await (await get('/fitness/templates')).json()) as { id: string }[];
    for (const t of templates) {
      await fetch(`${base}/fitness/templates/${t.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    }
  });

  await page.reload({ waitUntil: 'networkidle' });
}

/**
 * Give the shared user a short training history, through the real API.
 *
 * A spec that asserts on progress must not depend on other specs having
 * happened to log workouts — that is the same shared-state coupling as leaving
 * a session open, just inverted: the spec passes in a full run and fails alone,
 * which is the worst way round because it hides in green.
 *
 * Two sessions of the same movement at different weights, so a trend, a
 * personal record and a muscle breakdown all have something real to report.
 */
export async function seedWorkoutHistory(page: Page): Promise<void> {
  if (!page.url().startsWith('http')) await page.goto('/today');

  await page.evaluate(async () => {
    const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : '/api';
    const call = (path: string, init: RequestInit = {}) =>
      fetch(`${base}${path}`, {
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        ...init,
      });

    const exercises = (await (await call('/fitness/exercises')).json()) as {
      id: string;
      name: string;
    }[];
    const bench = exercises.find((e) => e.name.includes('Bench Press (Barbell)'));
    if (!bench) return;

    // 175 lb then 185 lb, both 5 reps: the second is a genuine record.
    for (const lb of [175, 185]) {
      const workout = (await (
        await call('/fitness/workouts', { method: 'POST', body: JSON.stringify({ title: 'Push' }) })
      ).json()) as { id: string };
      await call(`/fitness/workouts/${workout.id}/sets`, {
        method: 'POST',
        body: JSON.stringify({
          exerciseId: bench.id,
          reps: 5,
          weightGrams: Math.round(lb * 453.59237),
        }),
      });
      await call(`/fitness/workouts/${workout.id}/finish`, { method: 'POST', body: '{}' });
    }
  });

  await page.reload({ waitUntil: 'networkidle' });
}

/**
 * Clear every mood logged today, so a check-in spec starts from "not asked yet".
 *
 * Specs share one account by necessity (sign-up is throttled 5/min/IP), and
 * several of them log a mood — the writing spec, and the patterns spec — all
 * timestamped now. The check-in asks per WINDOW, so those correctly suppress
 * it, and a spec that assumed otherwise passed alone and failed in a full run:
 * the shape that hides in green.
 *
 * Clearing rather than deleting: there is no DELETE on journal entries, and
 * `mood` is nullable on PATCH precisely so a mood can be taken back off an
 * entry. The entry survives, which is also the truthful thing to do to someone
 * else's writing.
 */
export async function clearTodaysMoods(page: Page): Promise<void> {
  if (!page.url().startsWith('http')) await page.goto('/today');

  await page.evaluate(async () => {
    const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : '/api';
    const res = await fetch(`${base}/journal`, { credentials: 'include' });
    const entries = (await res.json()) as { id: string; mood: number | null; entryDate: string }[];
    const today = new Date().toDateString();
    for (const e of entries) {
      if (e.mood == null || new Date(e.entryDate).toDateString() !== today) continue;
      await fetch(`${base}/journal/${e.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mood: null }),
      });
    }
  });
}
