import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { register } from './helpers';

/**
 * The Life-OS shell: command bar, chat rail, sidebar, the Day Canvas (v4 home)
 * and History (the reverse-chron feed). One registered user is shared across
 * the whole file (register is throttled to 5/min server-side, so per-test
 * registration would rate-limit the suite); each test works with its own
 * uniquely-named data. NOTE: a brand-new user sees the first-run onboarding on
 * /today, so canvas assertions seed data first.
 */

const STATE = 'test-results/.life-os-state.json';

/** Navigate and wait for the signed-in shell (hotkeys attach with it). */
async function go(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.sidebar-user-name')).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  // Fresh context WITHOUT the (not-yet-written) shared storage state.
  const page = await browser.newPage({ storageState: undefined });
  await register(page);
  await page.context().storageState({ path: STATE });
  await page.close();
});

test.use({ storageState: STATE });

test('⌘K command bar opens, jumps to a section, and closes on Esc', async ({ page }) => {
  await go(page, '/today');

  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('combobox', { name: 'Command input' });
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();

  // Fuzzy jump: "hab" → Go to Habits.
  await input.fill('hab');
  await page.getByRole('option', { name: 'Go to Habits' }).click();
  await expect(page).toHaveURL(/\/habits$/);

  // Esc closes without navigating.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('combobox', { name: 'Command input' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'Command input' })).toBeHidden();
  await expect(page).toHaveURL(/\/habits$/);
});

test('⌘J summons the chat rail from any screen', async ({ page }) => {
  await go(page, '/today');

  await page.keyboard.press('ControlOrMeta+j');
  const rail = page.getByRole('complementary', { name: 'Atlas chat' });
  await expect(rail).toBeVisible();
  await expect(rail.getByLabel('Message Atlas')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(rail).toBeHidden();
});

test('sidebar collapses to an icon rail and remembers it', async ({ page }) => {
  await go(page, '/today');

  const sidebar = page.locator('.sidebar');
  await expect(sidebar).not.toHaveClass(/collapsed/);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(sidebar).toHaveClass(/collapsed/);

  // Preference survives a reload.
  await page.reload();
  await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);
});

test('the Day Canvas: capture, pager, now-line, habit chip check-in', async ({ page }) => {
  // Seed a habit first — a data-less account gets the onboarding, not the canvas.
  await go(page, '/habits');
  await page.getByLabel('New habit name').fill('Stretch');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check in "Stretch"' })).toBeVisible();

  await page.getByRole('link', { name: 'Today', exact: true }).click();

  // Canvas anchors: capture, the day pager on Today, the live now-line.
  await expect(page.getByLabel('Capture anything')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Today · / })).toBeVisible();
  await expect(page.getByRole('separator', { name: /^Now · / })).toBeVisible();

  // Habit chip checks in right from the canvas header strip.
  await page.getByRole('button', { name: /Check in Stretch/ }).click();
  await expect(page.getByRole('button', { name: /Stretch: done today/ })).toBeVisible();

  // Pager: yesterday has no now-line and no pager-title "Today ·"; snap back.
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('button', { name: /^Yesterday · / })).toBeVisible();
  await expect(page.getByRole('separator', { name: /^Now · / })).toBeHidden();
  await page.getByRole('button', { name: /^Yesterday · / }).click();
  await expect(page.getByRole('button', { name: /^Today · / })).toBeVisible();
});

test('History shows cross-domain moments and filters by domain', async ({ page }) => {
  await go(page, '/tasks');

  await page.getByLabel('New task title').fill('Write the story view');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Write the story view')).toBeVisible();

  await page.getByRole('link', { name: 'Habits', exact: true }).click();
  await page.getByLabel('New habit name').fill('Meditate');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Meditate')).toBeVisible();

  // Both land in History — the reverse-chron log surface.
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  const feed = page.getByRole('region', { name: 'Your story' });
  await expect(feed.getByText('Created task: Write the story view')).toBeVisible();
  await expect(feed.getByText('New habit: Meditate')).toBeVisible();

  // Domain filter narrows the feed.
  await feed.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(feed.getByText('Created task: Write the story view')).toBeVisible();
  await expect(feed.getByText('New habit: Meditate')).toBeHidden();

  // /timeline still redirects to the canvas home.
  await page.goto('/timeline');
  await expect(page).toHaveURL(/\/today$/);
});

test('the canvas and the open command bar pass the axe scan', async ({ page }) => {
  await go(page, '/today');
  await expect(page.getByLabel('Capture anything')).toBeVisible();

  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });

  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('combobox', { name: 'Command input' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious, JSON.stringify(serious.map((v) => v.id), null, 2)).toEqual([]);
});
