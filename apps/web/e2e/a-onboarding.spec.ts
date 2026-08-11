import AxeBuilder from '@axe-core/playwright';
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

/**
 * Scan whichever wizard step is on screen.
 *
 * The whole-app sweep in life-os.spec.ts cannot cover this: it seeds a task to
 * get PAST the wizard, so the one screen every account is guaranteed to see was
 * the only one nothing scanned. This spec already walks all three steps on a
 * fresh account, so it is the cheapest place to look — registration is throttled
 * 5/min/IP and a dedicated spec would cost one.
 */
async function scanStep(
  page: import('@playwright/test').Page,
  step: string,
  problems: string[],
): Promise<void> {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  for (const v of scan.violations) {
    problems.push(`a11y on ${step}: ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes[0]?.target.join(' ')}`);
  }

  const tiny = await page.evaluate(() => {
    const SEL = 'button, a[href], input, select, textarea, [role="button"], [role="checkbox"]';
    const out: string[] = [];
    for (const el of document.querySelectorAll(SEL)) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // This file DOES take 2.5.8's inline exemption, where the route sweep does
      // not, because the wizard has the genuine article: "Get one free at
      // platform.deepseek.com" is a link inside a sentence, sized by the
      // line-height of the prose around it. Padding it to 24px would push the
      // paragraph apart. On the app routes every link is a control, which is why
      // that sweep allows no exception at all.
      const inSentence = el.tagName === 'A' && cs.display.startsWith('inline') && el.closest('p');
      if (inSentence) continue;
      if (r.width < 24 || r.height < 24) {
        const name = el.getAttribute('aria-label') || el.textContent?.trim() || '';
        out.push(`${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName.toLowerCase()}.${el.className} "${name.slice(0, 30)}"`);
      }
    }
    return out;
  });
  for (const t of tiny) problems.push(`target size on ${step}: ${t}`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1) problems.push(`${step} overflows by ${overflow}px`);
}

test('a fresh account onboards in three steps into a routine-backed canvas', async ({ page }) => {
  test.setTimeout(90_000);
  const problems: string[] = [];
  // Register at desktop width, then drop to a phone for the wizard itself. The
  // register helper waits for `.sidebar-user-name` to be VISIBLE, and the
  // sidebar is display:none below 901px — signing up at 390 hangs on an element
  // that resolves and is deliberately hidden.
  await register(page);
  // The wizard is the first thing a PWA meant for a home screen ever shows, so
  // the width that matters is the phone.
  await page.setViewportSize({ width: 390, height: 844 });

  // Step 1 — sleep. No welcome screen: it asked for a name and gave nothing back.
  await expect(page.getByRole('heading', { name: /When does your day start and end/ })).toBeVisible();
  await scanStep(page, 'step 1 (sleep)', problems);
  await page.getByLabel('Bedtime').fill('23:00');
  await page.getByLabel('Wake time').fill('07:00');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2 — the week: a fixed job reveals exact hours.
  await page.getByLabel('Weekday shape').selectOption('office');
  await scanStep(page, 'step 2 (week)', problems);
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
  await scanStep(page, 'step 3 (api key)', problems);
  expect(problems, problems.join('\n')).toEqual([]);

  await page.getByRole('button', { name: 'Build my week' }).click();

  // Lands on the Today overview.
  await expect(page.getByRole('button', { name: /^Today · / })).toBeVisible({ timeout: 20_000 });

  // The work block is asserted through the routine editor, NOT the canvas:
  // onboarding writes Work on weekdays only, so a canvas assertion silently
  // depends on which day the suite happens to run.
  await page.goto('/settings');
  await expect(page.locator('.routine-summary')).toContainText('09:30–17:30');
});
