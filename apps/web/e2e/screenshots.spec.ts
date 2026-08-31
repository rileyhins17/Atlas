import { expect, test } from '@playwright/test';
import { register } from './helpers';

/**
 * Not a test — a screenshot rig for eyeballing the UI. Run explicitly:
 *   SHOTS=1 pnpm --filter @atlas/web exec playwright test e2e/screenshots.spec.ts
 * Writes PNGs to SHOT_DIR (env) or test-results/shots.
 *
 * It shoots BOTH widths. Atlas is a phone-first PWA whose design faults have
 * repeatedly been width-specific — a desktop-only rig is how a task title got
 * collapsed to zero pixels for weeks without anyone seeing it.
 */

const OUT = process.env.SHOT_DIR ?? 'test-results/shots';

/** Every surface a user can reach, in the order the nav presents them. */
const ROUTES: [path: string, name: string][] = [
  ['/today', '01-today'],
  ['/week', '02-week'],
  ['/looking-back', '03-looking-back'],
  ['/tasks', '04-tasks'],
  ['/goals', '05-goals'],
  ['/everything', '06-everything'],
  ['/habits', '07-habits'],
  ['/fitness', '08-fitness'],
  ['/journal', '09-writing'],
  ['/calendar', '10-calendar'],
  // Money is hidden from the nav but fully intact by decision, and a screen
  // nobody looks at is where a regression sits unnoticed.
  ['/finance', '11-money'],
  ['/settings', '12-settings'],
];

test('capture the Life-OS screens', async ({ page }) => {
  // Explicit-run only (SHOTS=1): this rig registers its own user, and in a full
  // suite run that third registration trips the 5/min register throttle.
  test.skip(!process.env.SHOTS, 'screenshot rig — run explicitly with SHOTS=1');
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);

  // FIRST, before any data exists: the first-run wizard. It is the only screen
  // every paying user is guaranteed to see, and it is the one the rig could
  // never reach — seeding a believable day is exactly what dismisses it.
  // Wait for the WIZARD, not for a stopwatch. These two frames are the only
  // screen every paying user is guaranteed to see, and a raw pause photographed
  // loading skeletons instead — so the most important screen in the product was
  // the one screen nobody had ever actually looked at. `.onb` is the wizard's
  // own root, so this either captures it or fails loudly.
  const wizard = page.locator('.onb');
  await expect(wizard).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500); // entrance animation
  await page.screenshot({ path: `${OUT}/00-onboarding.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(wizard).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/p-00-onboarding.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  // Seed a believable day straight through the API (cookie-authed). A routine
  // is part of that: without one the day canvas is a single Open block, which
  // is exactly the screen that tells you nothing about the design.
  await page.evaluate(async () => {
    const api = (p: string, body: unknown, method = 'POST') =>
      fetch(`http://localhost:4000${p}`, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const now = Date.now();
    const iso = (h: number) => new Date(now + h * 3600e3).toISOString();
    const EVERY_DAY = 127;
    await api(
      '/routine',
      {
        blocks: [
          { label: 'Sleep', kind: 'sleep', days: EVERY_DAY, startMin: 0, endMin: 7 * 60 },
          { label: 'Breakfast', kind: 'meal', days: EVERY_DAY, startMin: 7 * 60, endMin: 7 * 60 + 30 },
          { label: 'Work', kind: 'work', days: 62, startMin: 9 * 60, endMin: 17 * 60 },
          { label: 'Training', kind: 'exercise', days: 42, startMin: 18 * 60, endMin: 19 * 60 },
          { label: 'Dinner', kind: 'meal', days: EVERY_DAY, startMin: 19 * 60, endMin: 19 * 60 + 45 },
          { label: 'Wind down', kind: 'winddown', days: EVERY_DAY, startMin: 22 * 60, endMin: 23 * 60 + 30 },
        ],
      },
      'PUT',
    );
    await Promise.all([
      api('/tasks', { title: 'Finish quarterly report', priority: 'HIGH', dueAt: iso(-30) }),
      api('/tasks', { title: 'Review PR feedback', priority: 'URGENT', dueAt: iso(1) }),
      api('/tasks', { title: 'Call the dentist', priority: 'MEDIUM', dueAt: iso(3) }),
      api('/tasks', { title: 'Plan weekend trip', priority: 'LOW', dueAt: iso(52) }),
      api('/tasks', { title: 'Water the plants', priority: 'MEDIUM' }),
      api('/events', { title: 'Team standup', startAt: iso(-2), endAt: iso(-1.5) }),
      api('/events', { title: 'Deep work block', startAt: iso(1), endAt: iso(3) }),
      api('/events', { title: 'Dinner with Sam', startAt: iso(5), endAt: iso(7), location: "Nonna's" }),
      api('/habits', { name: 'Gym', target: 1 }),
      api('/habits', { name: 'Read', target: 1 }),
      api('/habits', { name: 'Water', target: 8 }),
      api('/journal', { body: 'Long day but the demo went well. Cautiously optimistic.', mood: 4 }),
      api('/journal', { body: 'Bit drained today, slept badly.', mood: 2 }),
      api('/journal', { body: 'Great run this morning — head feels clear.', mood: 5 }),
    ]);
  });

  // Check one habit in so rings/heatmaps show progress.
  await page.goto('/habits');
  await page.getByRole('button', { name: 'Check in "Gym"' }).click();
  await expect(page.getByLabel('1 day streak')).toBeVisible();

  /**
   * Wait for the screen to actually BE the screen before photographing it.
   *
   * A fixed pause was enough when the database was a container on this machine.
   * It is not enough against a hosted one in another region: the first pass
   * after the Supabase move produced a full-page "Waking Atlas…" splash for
   * /week and /goals and a wall of skeletons for /today — three pictures of
   * loading states, from a rig whose entire job is showing what the design
   * looks like. Design work done from those is design work done blind.
   *
   * So it waits on the two things that mean "still loading" and only then lets
   * the entrance animations settle.
   */
  const shoot = async (path: string, name: string) => {
    await page.goto(path);
    // Wait for the screen to BE the screen. Asserting the loader is absent
    // looks like it works and does not: right after goto neither the splash nor
    // the skeletons have rendered, so both absence checks pass instantly and
    // the shot lands on the loading state that appeared a moment later. Two
    // routes were photographed mid-load exactly that way, and /today came out
    // as a wall of grey bars in two consecutive runs.
    //
    // Waiting for the absence to become TRUE AND STAY true is what actually
    // holds, so this polls the page's own condition rather than a locator.
    await page.waitForFunction(
      () =>
        !document.body.innerText.includes('Waking Atlas') &&
        document.querySelectorAll('.skeleton').length === 0,
      { timeout: 45_000 },
    );
    await page.waitForTimeout(900); // let entrance animations settle
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  };

  for (const [path, name] of ROUTES) await shoot(path, name);

  // The hour-by-hour canvas. None of the routes above reach it — on today it is
  // folded away — and it is the screen the routine actually draws, so leaving it
  // out of the rig means never looking at it.
  await page.goto('/today');
  await page.getByRole('button', { name: /next day/i }).click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${OUT}/13-day-canvas.png`, fullPage: true });

  // Command bar open over Today.
  await page.goto('/today');
  await expect(page.locator('.sidebar-user-name')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('combobox', { name: 'Command input' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Command input' }).fill('call mom friday 3pm');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/14-command-bar.png` });

  // Chat rail open.
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+j');
  await expect(page.getByRole('complementary', { name: 'Atlas chat' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/15-chat-rail.png` });
  await page.keyboard.press('Escape');

  // The other theme — whichever the environment started in. More than Today,
  // because the surfaces most likely to drift are the ones built out of
  // color-mix() against the brand: the week grid and the charts.
  await page.getByRole('button', { name: /Switch to (light|dark) theme/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/16-today-alt-theme.png`, fullPage: true });
  await shoot('/week', '17-week-alt-theme');
  await shoot('/looking-back', '18-looking-back-alt-theme');
  await page.goto('/today');
  await page.getByRole('button', { name: /Switch to (light|dark) theme/i }).click();

  // …and every screen again at phone width, which is the primary target.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, name] of ROUTES) await shoot(path, `p-${name}`);

  await page.goto('/today');
  await page.getByRole('button', { name: /next day/i }).click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${OUT}/p-13-day-canvas.png`, fullPage: true });
});
