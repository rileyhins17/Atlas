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
  ['/settings', '11-settings'],
];

test('capture the Life-OS screens', async ({ page }) => {
  // Explicit-run only (SHOTS=1): this rig registers its own user, and in a full
  // suite run that third registration trips the 5/min register throttle.
  test.skip(!process.env.SHOTS, 'screenshot rig — run explicitly with SHOTS=1');
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);

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

  const shoot = async (path: string, name: string) => {
    await page.goto(path);
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
  await page.screenshot({ path: `${OUT}/15-day-canvas.png`, fullPage: true });

  // Command bar open over Today.
  await page.goto('/today');
  await expect(page.locator('.sidebar-user-name')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('combobox', { name: 'Command input' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Command input' }).fill('call mom friday 3pm');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/12-command-bar.png` });

  // Chat rail open.
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+j');
  await expect(page.getByRole('complementary', { name: 'Atlas chat' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/13-chat-rail.png` });
  await page.keyboard.press('Escape');

  // The other theme's Today — whichever theme the environment started in.
  await page.getByRole('button', { name: /Switch to (light|dark) theme/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/14-today-alt-theme.png`, fullPage: true });
  await page.getByRole('button', { name: /Switch to (light|dark) theme/i }).click();

  // …and every screen again at phone width, which is the primary target.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, name] of ROUTES) await shoot(path, `p-${name}`);

  await page.goto('/today');
  await page.getByRole('button', { name: /next day/i }).click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${OUT}/p-15-day-canvas.png`, fullPage: true });
});
