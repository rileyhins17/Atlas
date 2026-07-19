import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { register } from './helpers';

/**
 * The Life-OS shell: command bar, chat rail, sidebar, Home zones, Timeline.
 * One registered user is shared across the whole file (register is throttled
 * to 5/min server-side, so per-test registration would rate-limit the suite);
 * each test works with its own uniquely-named data.
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

test('Home is a dashboard: zones render and a habit ring checks in', async ({ page }) => {
  await go(page, '/today');

  // The four zones are present.
  await expect(page.getByRole('heading', { name: 'Your day' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Focus' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Habits' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pulse' })).toBeVisible();

  // Seed a habit via its page, then check in from the Home ring.
  await page.getByRole('link', { name: 'Habits', exact: true }).click();
  await page.getByLabel('New habit name').fill('Stretch');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check in "Stretch"' })).toBeVisible();

  await page.getByRole('link', { name: 'Home', exact: true }).click();
  const ring = page.getByRole('button', { name: /Check in Stretch/ });
  await ring.click();
  await expect(page.getByRole('button', { name: /Stretch: done today/ })).toBeVisible();
});

test('the Timeline shows cross-domain events and filters by domain', async ({ page }) => {
  await go(page, '/tasks');

  await page.getByLabel('New task title').fill('Write the story view');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Write the story view')).toBeVisible();

  await page.getByRole('link', { name: 'Habits', exact: true }).click();
  await page.getByLabel('New habit name').fill('Meditate');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Meditate')).toBeVisible();

  await page.getByRole('link', { name: 'Timeline', exact: true }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(page.getByText('Created task: Write the story view')).toBeVisible();
  await expect(page.getByText('New habit: Meditate')).toBeVisible();

  // Domain filter narrows the stream.
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText('Created task: Write the story view')).toBeVisible();
  await expect(page.getByText('New habit: Meditate')).toBeHidden();
});

test('Home and the open command bar pass the axe scan', async ({ page }) => {
  await go(page, '/today');
  await expect(page.getByRole('heading', { name: 'Focus' })).toBeVisible();

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
