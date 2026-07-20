import { expect, test } from '@playwright/test';
import { register } from './helpers';

/**
 * Not a test — a screenshot rig for eyeballing the UI. Run explicitly:
 *   pnpm --filter @atlas/web exec playwright test e2e/screenshots.spec.ts
 * Writes PNGs to SHOT_DIR (env) or test-results/shots.
 */

const OUT = process.env.SHOT_DIR ?? 'test-results/shots';

test('capture the Life-OS screens', async ({ page }) => {
  // Explicit-run only (SHOTS=1): this rig registers its own user, and in a full
  // suite run that third registration trips the 5/min register throttle.
  test.skip(!process.env.SHOTS, 'screenshot rig — run explicitly with SHOTS=1');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);

  // Seed a believable day straight through the API (cookie-authed).
  await page.evaluate(async () => {
    const api = (p: string, body: unknown) =>
      fetch(`http://localhost:4000${p}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const now = Date.now();
    const iso = (h: number) => new Date(now + h * 3600e3).toISOString();
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

  await shoot('/today', '1-home');
  await shoot('/tasks', '2-tasks');
  await shoot('/habits', '3-habits');
  await shoot('/finance', '4-finance'); // /timeline now redirects into the home stream
  await shoot('/journal', '5-journal');

  // Command bar open over Home.
  await page.goto('/today');
  await expect(page.locator('.sidebar-user-name')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('combobox', { name: 'Command input' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Command input' }).fill('call mom friday 3pm');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/6-command-bar.png` });

  // Chat rail open.
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+j');
  await expect(page.getByRole('complementary', { name: 'Atlas chat' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/7-chat-rail.png` });

  // The other theme's Home — whichever theme the environment started in.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Switch to (light|dark) theme/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/8-home-alt-theme.png`, fullPage: true });
});
