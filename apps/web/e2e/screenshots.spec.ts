import { mkdirSync, writeFileSync } from 'node:fs';
import { AUDIT_ROUTES, measureScreen, screenFailures } from './ui-measurements';
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
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  const measurements: Awaited<ReturnType<typeof measureScreen>>[] = [];
  mkdirSync(OUT, { recursive: true });

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
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Start using Atlas' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    measurements.push(await measureScreen(page, '/today:first-use', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/first-use-${theme}.png`, fullPage: true });
  }

  // This account has no provider or routine. Prove first value through the
  // actual capture path before seeding the richer screenshot fixture.
  const marker = `FirstUse${Date.now()}`;
  const firstCapture = page.getByRole('region', { name: 'Start using Atlas' });
  await firstCapture.getByLabel('Capture anything').click();
  await firstCapture.getByLabel('Capture anything').pressSequentially(`buy groceries ${marker}`);
  await firstCapture.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(firstCapture).toHaveCount(0, { timeout: 30_000 });
  const savedTasks = await page.request.get('http://localhost:4000/tasks');
  expect(savedTasks.ok()).toBe(true);
  const saved = await savedTasks.json() as { id: string; title: string }[];
  expect(saved.some((task) => task.id && task.title.includes(marker))).toBe(true);
  const routine = await page.request.get('http://localhost:4000/routine');
  expect(routine.ok()).toBe(true);
  expect(await routine.json()).toEqual([]);
  await page.getByRole('region', { name: 'First capture complete' }).getByRole('link', { name: 'Review my tasks' }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.locator('.task-title-btn').filter({ hasText: marker })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('atlas-theme', 'light'));
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

  // The original 33-image rig was run and all PNGs inspected at 1b60239 before
  // adding this stricter baseline. Collect every route before asserting, so a
  // single broken control cannot hide findings on the remaining screens.
  mkdirSync(OUT, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
    for (const route of AUDIT_ROUTES) {
      await page.goto(route);
      await expect(page.getByLabel('Capture anything')).toBeAttached();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.skeleton')).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const report = await measureScreen(page, route, theme);
      measurements.push(report);
      writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
      await page.screenshot({ path: `${OUT}/audit-${theme}-${route.slice(1)}.png`, fullPage: true });
    }
  }
  const manualAccount = await page.request.post('http://localhost:4000/finance/accounts', {
    data: { name: 'Everyday cash', type: 'cash', currency: 'CAD', balanceMinor: 20000 },
  });
  expect(manualAccount.status()).toBe(201);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
    await page.goto('/finance');
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    const form = page.getByRole('form', { name: 'New manual transaction' });
    await form.getByLabel('Description', { exact: true }).click();
    await form.getByLabel('Description', { exact: true }).pressSequentially('Groceries');
    await form.getByLabel('Amount (CAD)', { exact: true }).click();
    await form.getByLabel('Amount (CAD)', { exact: true }).pressSequentially('18.29');
    measurements.push(await measureScreen(page, '/finance:transaction', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/manual-transaction-${theme}.png`, fullPage: true });
    await page.evaluate(() => {
      for (const id of ['training', 'proactive']) localStorage.setItem(`atlas-settings-${id}`, '1');
    });
    await page.goto('/settings');
    await expect(page.getByRole('group', { name: 'Weight unit' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Checking notifications' })).toHaveCount(0);
    await expect(page.locator('.skeleton')).toHaveCount(0);
    measurements.push(await measureScreen(page, '/settings:actions', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/settings-actions-${theme}.png`, fullPage: true });
  }
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
    await page.goto('/today');
    await page.reload();
    await expect(page.getByRole('region', { name: 'Quick capture' })).toBeVisible();
    await page.getByRole('button', { name: 'Search and capture', exact: true }).click();
    const input = page.getByRole('combobox', { name: 'Command input' });
    await page.route('http://localhost:4000/search?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await input.click(); await input.pressSequentially('Dentist');
    await expect(page.getByText('Your saved items could not be searched.')).toBeVisible({ timeout: 20_000 });
    measurements.push(await measureScreen(page, '/today:search-error', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/search-error-${theme}.png`, fullPage: true });
    await page.unroute('http://localhost:4000/search?*');
    await input.click(); await input.press('ControlOrMeta+a');
    await input.pressSequentially(`zznomatch${Date.now()}`);
    await expect(page.getByText('No saved items match this search.')).toBeVisible();
    measurements.push(await measureScreen(page, '/today:search-empty', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/search-empty-${theme}.png`, fullPage: true });
    await input.press('Escape');
  }
  const linkGoalResponse = await page.request.post('http://localhost:4000/goals', { data: { title: 'Training consistency', horizon: 'short' } });
  expect(linkGoalResponse.status()).toBe(201);
  const linkGoal = await linkGoalResponse.json() as { id: string };
  const linkTaskResponse = await page.request.post('http://localhost:4000/tasks', { data: { title: 'Plan next training week', goalId: linkGoal.id } });
  expect(linkTaskResponse.status()).toBe(201);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
    await page.route('http://localhost:4000/goals', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.goto('/tasks');
    await page.reload();
    const row = page.locator('.task').filter({ hasText: 'Plan next training week' });
    await row.getByRole('button', { name: 'Goal linked — view or change', exact: true }).click();
    await expect(row.getByText('Your goals could not be loaded.')).toBeVisible({ timeout: 20_000 });
    measurements.push(await measureScreen(page, '/tasks:goal-error', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/goal-error-${theme}.png`, fullPage: true });
    await page.unroute('http://localhost:4000/goals');
  }
  const weightWorkoutResponse = await page.request.post('http://localhost:4000/fitness/workouts', { data: { title: 'Saved training session' } });
  expect(weightWorkoutResponse.status()).toBe(201);
  const weightWorkout = await weightWorkoutResponse.json() as { id: string };
  expect((await page.request.post(`http://localhost:4000/fitness/workouts/${weightWorkout.id}/finish`, { data: {} })).ok()).toBe(true);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
    await page.route('http://localhost:4000/settings', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.goto('/fitness');
    await page.reload();
    await expect(page.getByText('Weight units could not be loaded.')).toBeVisible({ timeout: 20_000 });
    measurements.push(await measureScreen(page, '/fitness:history-unit-error', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/history-unit-error-${theme}.png`, fullPage: true });
    await page.unroute('http://localhost:4000/settings');
  }
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
    await page.route('http://localhost:4000/connectors/google/status', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Calendar connection could not be checked.' }) }));
    await page.goto('/calendar');
    await page.reload();
    await expect(page.getByText('Calendar connection could not be checked.')).toBeVisible({ timeout: 20_000 });
    measurements.push(await measureScreen(page, '/calendar:connection-error', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/calendar-connection-error-${theme}.png`, fullPage: true });
    await page.unroute('http://localhost:4000/connectors/google/status');
  }
  const editTaskResponse = await page.request.post('http://localhost:4000/tasks', { data: { title: 'Book the next appointment' } });
  expect(editTaskResponse.status()).toBe(201);
  const editTask = await editTaskResponse.json() as { id: string };
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
    await page.goto('/tasks');
    await page.reload();
    await page.getByRole('button', { name: 'Book the next appointment — click to edit', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Edit task title', exact: true });
    await input.click(); await input.press('ControlOrMeta+a'); await input.pressSequentially('Book an appointment that fits next week');
    await page.route(`http://localhost:4000/tasks/${editTask.id}`, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.getByRole('button', { name: 'Save title', exact: true }).click();
    await expect(page.getByText('Title was not confirmed. Your edit is kept.')).toBeVisible();
    measurements.push(await measureScreen(page, '/tasks:title-error', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/task-title-error-${theme}.png`, fullPage: true });
    await page.unroute(`http://localhost:4000/tasks/${editTask.id}`);
  }
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'default' });
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', { configurable: true, value: async () => ({ pushManager: {
      getSubscription: async () => ({ endpoint: 'https://push.example.test/synthetic', unsubscribe: async () => true }),
    } }) });
  });
  await page.route('http://localhost:4000/push/unsubscribe', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => { localStorage.setItem('atlas-theme', value); localStorage.setItem('atlas-settings-proactive', '1'); }, theme);
    await page.goto('/settings');
    await page.reload();
    await page.locator('#proactive-body').getByRole('button', { name: 'Disable notifications', exact: true }).click();
    await expect(page.getByText('Notification change was not confirmed. Try again.')).toBeVisible();
    measurements.push(await measureScreen(page, '/settings:notification-change-error', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/notification-change-error-${theme}.png`, fullPage: true });
  }
  await page.unroute('http://localhost:4000/push/unsubscribe');
  const connectionZero = { tasksCompleted: 0, habitChecks: 0, moodAvg: null, journalEntries: 0, spentMinor: 0, earnedMinor: 0, workouts: 0, volumeGrams: 0, events: 0 };
  for (const theme of ['light', 'dark'] as const) {
    for (const state of ['error', 'no-pattern'] as const) {
      await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
      await page.route('http://localhost:4000/stats?days=30', (route) => state === 'error'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
        : route.fulfill({ contentType: 'application/json', body: JSON.stringify({
          days: Array.from({ length: 30 }, (_, index) => ({ ...connectionZero, day: `2026-08-${String(index + 1).padStart(2, '0')}`, tasksCompleted: 1, workouts: 1, moodAvg: 3 })),
          totals: { current: { ...connectionZero, tasksCompleted: 30, workouts: 30, moodAvg: 3 }, previous: connectionZero },
        }) }));
      await page.goto('/today'); await page.reload();
      await expect(page.getByText(state === 'error' ? 'Connections could not be loaded.' : 'No clear connections in the last 30 days.')).toBeVisible({ timeout: 20_000 });
      measurements.push(await measureScreen(page, `/today:connections-${state}`, theme));
      writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
      await page.screenshot({ path: `${OUT}/connections-${state}-${theme}.png`, fullPage: true });
      await page.unroute('http://localhost:4000/stats?days=30');
    }
  }
  for (const theme of ['light', 'dark'] as const) {
    const historyRow = { id: 'synthetic-history', type: 'task.created', source: 'tasks', title: 'Review the weekly plan', summary: null, refType: 'task', refId: 'synthetic-task', occurredAt: '2026-09-01T12:00:00Z' };
    await page.route('http://localhost:4000/timeline?*', (route) => {
      const query = new URL(route.request().url()).searchParams;
      if (query.get('limit') !== '50') return route.continue();
      return query.get('offset') === '50'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
        : route.fulfill({ contentType: 'application/json', body: JSON.stringify({ events: [historyRow], hasMore: true }) });
    });
    await page.route('http://localhost:4000/tasks', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
    await page.goto('/looking-back'); await page.reload();
    await page.getByRole('button', { name: 'Everything that happened', exact: true }).click();
    const feed = page.getByRole('region', { name: 'Your story', exact: true });
    await expect(feed.getByText('Task actions could not be loaded.')).toBeVisible({ timeout: 20_000 });
    await feed.getByRole('button', { name: 'Show earlier', exact: true }).click();
    await expect(feed.getByText('Earlier activity could not be loaded.')).toBeVisible({ timeout: 20_000 });
    measurements.push(await measureScreen(page, '/looking-back:history-errors', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/history-errors-${theme}.png`, fullPage: true });
    await page.unroute('http://localhost:4000/timeline?*');
    await page.unroute('http://localhost:4000/tasks');
  }
  // Session/config failures use synthetic responses, never another registration.
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('atlas-theme', value), theme);
    await page.route('http://localhost:4000/auth/me', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.goto('/today');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Could not load your session' })).toBeVisible();
    measurements.push(await measureScreen(page, '/today:session-failure', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/session-failure-${theme}.png`, fullPage: true });
    await page.unroute('http://localhost:4000/auth/me');
    await page.route('http://localhost:4000/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    await page.route('http://localhost:4000/auth/config', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ inviteRequired: true }) }));
    await page.reload();
    await page.getByRole('button', { name: 'Show the create account form' }).click();
    await expect(page.getByLabel('Invite code', { exact: true })).toBeVisible();
    measurements.push(await measureScreen(page, '/today:invite-sign-up', theme));
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${OUT}/invite-sign-up-${theme}.png`, fullPage: true });
    await page.unroute('http://localhost:4000/auth/me');
    await page.unroute('http://localhost:4000/auth/config');
  }
  const failures = measurements.flatMap(screenFailures);
  expect(failures, failures.join('\n')).toEqual([]);

});
