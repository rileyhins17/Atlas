import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ACCOUNT_LEDGER, TEST_PASSWORD, apiBase } from './helpers';

/**
 * Delete the accounts this run created.
 *
 * A full suite used to leave throwaway users behind and nothing removed them,
 * so the database climbed to 181 rows of which three were real people. Tidying
 * that by hand runs straight into this project's hard rule, because an address
 * that looked like test junk once held the only live Google Calendar
 * credential.
 *
 * So this deletes by an EXACT LIST, never by a pattern. `uniqueEmail()` records
 * every address it hands out; this reads that file and deletes precisely those,
 * authenticating as each with the suite's own password. An account it did not
 * create is an account it cannot name, and therefore cannot touch.
 *
 * `POST /account/delete` is throttled to five a minute per IP, which is right —
 * it is irreversible and there is no honest reason to call it in a burst. This
 * works WITH that limit rather than around it: anything it could not remove
 * stays in the ledger and the next run retries it. The steady state is a
 * database that does not grow, without a teardown that sits waiting on a timer.
 *
 * Failures are reported and never thrown. A green suite followed by a red
 * teardown reads as a failed run, and a few leftover rows is a far smaller
 * problem than making people distrust the result.
 */
export default async function globalTeardown(): Promise<void> {
  let emails: string[];
  try {
    emails = [
      ...new Set(
        readFileSync(ACCOUNT_LEDGER, 'utf8')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ];
  } catch {
    return; // Nothing registered — nothing to clean up.
  }
  if (emails.length === 0) return;

  const base = apiBase();
  let deleted = 0;
  let alreadyGone = 0;
  const remaining: string[] = [];
  let throttled = false;

  for (const email of emails) {
    // Once the window is spent every further call is a 429. Stop asking and
    // leave the rest for next time rather than hammering a rate limiter.
    if (throttled) {
      remaining.push(email);
      continue;
    }

    try {
      const login = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: TEST_PASSWORD }),
      });

      if (login.status === 401) {
        // Credentials that resolve to no account. For an address only this
        // suite ever created, that means it is already gone — the
        // account-deletion spec deletes its own.
        alreadyGone += 1;
        continue;
      }
      if (!login.ok) {
        remaining.push(email);
        if (login.status === 429) throttled = true;
        continue;
      }

      // The session cookie authorises the delete, and the password is required
      // again on top of it.
      const cookie = login.headers.getSetCookie?.().join('; ') ?? '';
      const res = await fetch(`${base}/account/delete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        // `confirm` is an intent guard on the endpoint, not a formality: the
        // schema requires the literal string, so a mis-click cannot delete an
        // account and neither can a request that forgot it.
        body: JSON.stringify({ password: TEST_PASSWORD, confirm: 'DELETE' }),
      });

      if (res.ok) deleted += 1;
      else {
        remaining.push(email);
        if (res.status === 429) throttled = true;
      }
    } catch {
      remaining.push(email);
    }
  }

  // Carry the rest forward rather than losing track of them.
  if (remaining.length > 0) writeFileSync(ACCOUNT_LEDGER, `${remaining.join('\n')}\n`);
  else rmSync(ACCOUNT_LEDGER, { force: true });

  const parts = [`removed ${deleted}`];
  if (alreadyGone > 0) parts.push(`${alreadyGone} already gone`);
  if (remaining.length > 0) parts.push(`${remaining.length} carried to the next run`);
  console.log(`\nTeardown: ${parts.join(', ')}.`);
}
