import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { clearTodaysMoods, register, resetFitness, seedWorkoutHistory } from './helpers';

/**
 * The Life-OS shell: command bar, chat rail, sidebar, the Today overview (v4
 * home) and History (the reverse-chron feed). One registered user is shared across
 * the whole file (register is throttled to 5/min server-side, so per-test
 * registration would rate-limit the suite); each test works with its own
 * uniquely-named data. NOTE: a brand-new user sees the first-run onboarding on
 * /today, so overview assertions seed data first.
 */

const STATE = 'test-results/.life-os-state.json';

/**
 * Navigate and wait until the app is actually INTERACTIVE, not merely painted.
 *
 * `.sidebar-user-name` becoming visible only proves markup rendered. The global
 * hotkey listener (⌘K, ⌘J) is attached by AtlasUiProvider in an effect, so a
 * keypress sent between paint and hydration is simply dropped — the command bar
 * never opens and the failure reads as "element not found", which looks like a
 * missing feature rather than a race.
 *
 * The capture dock is client-only, so waiting for it proves hydration ran.
 */
async function go(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.sidebar-user-name')).toBeVisible();
  // The dock OR the first-run wizard.
  //
  // Waiting on the dock alone raced: on the first paint the data queries are
  // still pending, so the app is not yet "first run" and the dock renders —
  // then the queries resolve, the wizard takes over, and the wizard hides the
  // dock (it owns the screen). An assertion landing either side of that flip
  // gave an intermittent failure on whichever spec happened to run against an
  // account with no data yet. Both are proof of hydration, which is all this
  // helper is actually asking about.
  await expect(page.locator('.capture-dock, .onb').first()).toBeAttached();
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

test('Today overview: capture, pager, now/next, habit check-in', async ({ page }) => {
  // Seed a habit first — a data-less account gets the onboarding, not the overview.
  await go(page, '/habits');
  await page.getByLabel('New habit name').fill('Stretch');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check in "Stretch"' })).toBeVisible();

  await page.getByRole('link', { name: 'Today', exact: true }).click();

  // Overview anchors: the docked capture, the day pager, the live now/next card.
  await expect(page.getByLabel('Capture anything')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Today · / })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Right now' })).toBeVisible();

  // Habits live in the one checklist now — ticking there marks them done.
  const checklist = page.getByRole('region', { name: 'Checklist' });
  await expect(checklist).toBeVisible();
  await checklist.getByRole('button', { name: /Check in Stretch/ }).click();
  await expect(checklist.getByText('Stretch')).toBeVisible();
  await expect(checklist.getByText('done')).toBeVisible();

  // Pager: yesterday has no now/next card and no "Today ·" title; snap back.
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('button', { name: /^Yesterday · / })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Right now' })).toBeHidden();
  await page.getByRole('button', { name: /^Yesterday · / }).click();
  await expect(page.getByRole('button', { name: /^Today · / })).toBeVisible();
});

test('the capture dock and the asks bell are on every page', async ({ page }) => {
  await go(page, '/progress');
  // Capture is docked app-wide now, not just on Today.
  await expect(page.locator('.capture-dock').getByLabel('Capture anything')).toBeVisible();

  // The bell opens the asks panel, which leads with why answering is worth it.
  await page.locator('.sidebar').getByRole('button', { name: /Atlas has/ }).click();
  await expect(page.getByText(/Answer these and Atlas plans your days better/)).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
});

test('History shows cross-domain moments and filters by domain', async ({ page }) => {
  await go(page, '/tasks');

  await page.getByLabel('New task title').fill('Write the story view');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Write the story view')).toBeVisible();

  // Habits lives under Everything now, not in the primary nav.
  await page.goto('/habits');
  await expect(page).toHaveURL(/\/habits$/);
  await page.getByLabel('New habit name').fill('Meditate');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Meditate')).toBeVisible();

  // Both land in the feed — the folded-away half of Progress.
  await page.goto('/progress');
  await page.getByRole('button', { name: /Everything that happened/ }).click();
  const feed = page.getByRole('region', { name: 'Your story' });
  await expect(feed.getByText('Created task: Write the story view')).toBeVisible();
  await expect(feed.getByText('New habit: Meditate')).toBeVisible();

  // Domain filter narrows the feed.
  await feed.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(feed.getByText('Created task: Write the story view')).toBeVisible();
  await expect(feed.getByText('New habit: Meditate')).toBeHidden();

  // /timeline still redirects to the Today home.
  await page.goto('/timeline');
  await expect(page).toHaveURL(/\/today$/);
});

test('Tasks filters, searches, and quick-adds into a group', async ({ page }) => {
  await go(page, '/tasks');

  // Its OWN baseline, twice over. The per-group "Add to today" affordance only
  // exists once the list has groups, and the search box only appears once there
  // are enough tasks for searching to beat reading — so this spec used to pass
  // or fail on whatever earlier specs happened to leave behind.
  // Typed, not filled: fill() sets the DOM value and dispatches one input
  // event, which a React controlled input can miss — `title` stays empty, the
  // Add button stays disabled, and the click retries until the test times out.
  // Measured here, in exactly that shape.
  const stamp = Date.now();
  const box = page.getByPlaceholder('Add a task…');
  for (let i = 0; i < 8; i++) {
    await box.click();
    await box.pressSequentially(`Seed ${stamp}-${i}`);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    // Wait for the write to land before typing the next one: the composer is
    // latched while a create is in flight.
    await expect(page.locator('.task', { hasText: `Seed ${stamp}-${i}` })).toBeVisible({
      timeout: 15_000,
    });
  }
  await expect(page.getByLabel('Search tasks')).toBeVisible({ timeout: 15_000 });

  // Quick-add drops a task straight into Today with its due date pre-set.
  await page.getByRole('button', { name: /Add to today/i }).first().click();
  await page.getByLabel('New task in Today').fill('Quick added task');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByText('Quick added task')).toBeVisible();

  // Search narrows the list; a non-match disappears.
  await page.getByLabel('Search tasks').fill('Quick added');
  await expect(page.getByText('Quick added task')).toBeVisible();
  await page.getByLabel('Search tasks').fill('zzzz-no-match');
  await expect(page.getByText('Nothing matches that')).toBeVisible();
  await page.getByLabel('Search tasks').fill('');

  // Filter chips switch the view.
  await page.getByRole('button', { name: 'Overdue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Overdue', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('Progress leads with what changed and passes the axe scan', async ({ page }) => {
  // Self-seeding. This used to lean on another spec having completed a task
  // earlier in the file, which passes in a full run and fails alone — the shape
  // that hides in green. The page says what CHANGED, so it needs something to
  // have changed.
  await go(page, '/today');
  await page.evaluate(async () => {
    const post = (path: string, body: unknown) =>
      fetch(`http://localhost:4000${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const made = await post('/tasks', { title: `Progress seed ${Date.now()}`, priority: 'LOW' });
    const task = (await made.json()) as { id: string };
    await post(`/tasks/${task.id}/complete`, {});
    await post('/journal', { body: 'Seeded for the progress spec.', mood: 4 });
  });

  await go(page, '/progress');
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();

  // Range chips drive the window.
  await page.getByRole('button', { name: '90 days' }).click();
  await expect(page.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');

  // The page leads with SENTENCES now, and every one carries a real number.
  // It used to lead with "193 things happened" over six sparklines that had no
  // axis, no baseline and no values — shapes you could not read anything off.
  const changes = page.locator('.wc-item');
  await expect(changes.first()).toBeVisible();
  await expect(changes.first()).toContainText(/\d/);

  // The calendar is labelled on every axis. The version this replaced was a
  // bare grid of squares: no weekdays, no months, no scale, and a tooltip
  // carrying a raw ISO date — which on a phone, with no hover, was decoration.
  await expect(page.locator('.cal-weekdays')).toContainText('Mon');
  await expect(page.locator('.cal-months')).not.toBeEmpty();
  await expect(page.locator('.cal-key')).toBeVisible();

  // Tapping a day names it. This is the only way the calendar works on touch.
  const firstDay = page.locator('.cal-cell:not([data-level="future"])').first();
  await firstDay.click();
  await expect(page.locator('.cal-readout')).toContainText(
    /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/,
  );

  // The charts still exist as evidence, but folded away rather than being the
  // page. Nothing from the old headline tiles survives.
  await expect(page.getByText('Tasks done')).toHaveCount(0);
  await expect(page.getByText('things happened')).toHaveCount(0);
  await expect(page.locator('.prog-grid')).toHaveCount(0);
  await page.getByRole('button', { name: 'Charts' }).click();
  await expect(page.locator('.prog-grid')).toBeVisible();

  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  // Every violation, not only serious and critical. Filtering by impact meant
  // the suite reported "axe clean" for months while discarding meta-viewport —
  // a moderate finding, and a real WCAG 1.4.4 failure that disabled pinch-zoom
  // on every page of a PWA meant to live on a phone.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations.map((v) => `${v.id} (${v.impact})`), null, 2),
  ).toEqual([]);
});

test('Today and the open command bar pass the axe scan', async ({ page }) => {
  await go(page, '/today');
  await expect(page.getByLabel('Capture anything')).toBeVisible();

  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });

  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('combobox', { name: 'Command input' })).toBeVisible();

  // Every violation, not only serious and critical. Filtering by impact meant
  // the suite reported "axe clean" for months while discarding meta-viewport —
  // a moderate finding, and a real WCAG 1.4.4 failure that disabled pinch-zoom
  // on every page of a PWA meant to live on a phone.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations.map((v) => `${v.id} (${v.impact})`), null, 2),
  ).toEqual([]);
});

test('a recurring task rolls forward to its next occurrence when completed', async ({ page }) => {
  await go(page, '/tasks');

  const title = `Recurring ${Date.now()}`;

  // Its OWN baseline. The per-group "Add to today" affordance only exists once
  // the list has rendered its groups — with no tasks at all the panel shows an
  // empty state instead, so this spec passed or failed purely on whether an
  // earlier spec happened to have left a task behind. The top-of-page add field
  // is unconditional, so seeding through it makes the groups appear.
  await page.getByPlaceholder('Add a task…').fill(`Seed ${Date.now()}`);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.task')).not.toHaveCount(0);

  await page.getByRole('button', { name: /Add to today/i }).first().click();
  // Repeat is a tap, not a typed RRULE.
  await page.getByRole('button', { name: 'Every weekday', exact: true }).click();
  await page.getByLabel(/New task in Today/i).fill(title);
  await page.getByRole('button', { name: 'Add task', exact: true }).click();

  const row = page.locator('.task', { hasText: title });
  await expect(row).toHaveCount(1);
  // The rule reads as English on the row, never as raw iCal.
  await expect(row.getByText('Every weekday')).toBeVisible();

  // Completing it must leave the series alive: one open instance, dated later.
  // The next instance is spawned by the server DURING the completion request,
  // so wait for that response — reloading before it lands races the spawn and
  // the fresh page fetches a list that does not have the new row yet.
  const completed = page.waitForResponse(
    (r) => r.url().includes('/complete') && r.request().method() === 'POST',
  );
  await row.locator('button.check').first().click();
  await completed;

  const open = page.locator('.task:not(.done)', { hasText: title });
  await expect(open).toHaveCount(1);
  await expect(open.getByText('Every weekday')).toBeVisible();

  // And it is real, not optimistic UI, so it survives a reload.
  await page.reload();
  await expect(page.locator('.sidebar-user-name')).toBeVisible();
  await expect(page.locator('.task:not(.done)', { hasText: title })).toHaveCount(1);
});

test('a workout logs sets, badges a real PR, and lands in history when finished', async ({ page }) => {
  await go(page, '/fitness');

  // With no saved days yet, the quick-start chips are the path: naming the
  // session is the only decision, so the usual answers are offered rather than
  // an empty field.
  await expect(page.getByRole('button', { name: 'Push', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Push', exact: true }).click();
  await expect(page.locator('.fit-active')).toBeVisible();

  // Search-first picker: the catalog is long, scrolling it mid-workout is slow.
  //
  // Named exactly. The catalog carries six lateral raises — dumbbell, cable,
  // machine, banded, leaning, Egyptian — so a substring that used to identify
  // one movement now identifies a family, and the rest of this spec asserts on
  // set rows belonging to a specific one.
  await page.getByRole('button', { name: /Add exercise/i }).click();
  await page.getByLabel('Search exercises').fill('lateral raise (dumbbell)');
  await page.getByRole('option', { name: /^Lateral Raise \(Dumbbell\)/ }).click();
  await expect(page.locator('.fit-block')).toBeVisible();

  // Pounds by default now — the field, its label and the set lines all agree.
  for (const [lb, reps] of [
    ['20', '12'],
    ['30', '10'],
    ['25', '12'],
  ]) {
    await page.getByLabel(/^Weight in lb for Lateral Raise/i).fill(lb);
    await page.getByLabel(/^Reps for Lateral Raise/i).fill(reps);
    await page.getByRole('button', { name: /Log set/i }).click();
  }
  await expect(page.locator('.fit-set')).toHaveCount(3);
  await expect(page.locator('.fit-set').first()).toContainText('20 lb');

  // Exactly two records: the first-ever set, then the one that beats it. The
  // third is heavier than nothing but lighter than 30 lb, so it is NOT a PR —
  // an app that celebrates every set teaches you to ignore the badge.
  await expect(page.locator('.fit-pr')).toHaveCount(2);

  // Finishing must clear the session, not leave the logger on screen.
  await page.getByRole('button', { name: /^Finish$/ }).click();

  // Finishing now opens the summary, which covers the page until dismissed.
  const summary = page.locator('.dialog-content');
  await expect(summary).toBeVisible();
  await summary.getByRole('button', { name: 'Done' }).click();

  await expect(page.locator('.fit-active')).toHaveCount(0);
  await expect(page.locator('.fit-history-row').first()).toContainText('Lateral Raise');
});

test('the routine editor fixes work hours, per-day patterns, and one-off shifts', async ({ page }) => {
  await go(page, '/settings');

  // A brand-new account has no routine, so seed one through the editor itself —
  // which is also the "I never onboarded properly" path this screen exists for.
  await page.getByRole('button', { name: /Add to my week/i }).click();
  const row = page.locator('.routine-row').first();
  await expect(row).toBeVisible();

  // Shape (a): fixed weekday hours. Correcting these is the whole point — before
  // this editor existed a routine captured at signup could never be changed.
  await row.locator('input[type=time]').first().fill('07:30');
  await expect(page.locator('.routine-summary')).toContainText('07:30');

  // Shape (b): varies by day — drop Friday from the pattern.
  await row.getByRole('button', { name: 'Friday' }).click();
  await expect(page.locator('.routine-summary')).toContainText('Mon, Tue, Wed, Thu');

  // Shape (c): irregular — a dated block that overrides the weekly one.
  await page.getByRole('button', { name: /Working a one-off today/i }).click();
  await expect(page.locator('.routine-oneoff')).toHaveCount(1);

  // And it must be removable, or a mistaken shift is permanent.
  await page.locator('.routine-row', { has: page.locator('.routine-oneoff') })
    .getByRole('button', { name: /^Delete/ })
    .click();
  await expect(page.locator('.routine-oneoff')).toHaveCount(0);
});

test('Today offers free time around the routine, never during work', async ({ page }) => {
  await go(page, '/today');

  // The account has a routine by now (previous test), so the free-time block
  // should be reasoning about real windows.
  const free = page.locator('.freetime');
  if (await free.count()) {
    // Whatever it offers, none of it may fall inside the working block.
    const gaps = await page.$$eval('.freetime-gap-when', (els) => els.map((e) => e.textContent!.trim()));
    for (const g of gaps) expect(g).toMatch(/\d/);
    // The escape hatch to fix a wrong routine is always present.
    await expect(page.locator('.freetime-fix')).toBeVisible();
  }
});

test('work that slipped is settled in one batched decision', async ({ page }) => {
  await go(page, '/today');

  // Seed two overdue tasks through the API: the quick-adds can only create
  // work due today or later, and an "Overdue" group does not exist until
  // something is actually overdue.
  const titles = [`Slipped A ${Date.now()}`, `Slipped B ${Date.now()}`];
  await page.evaluate(async (ts) => {
    const dueAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    for (const title of ts) {
      await fetch('http://localhost:4000/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, dueAt }),
      });
    }
  }, titles);

  await page.reload();
  const card = page.locator('.slipped');
  await expect(card).toBeVisible();
  await expect(card.getByText(titles[0]!)).toBeVisible();

  // Deselecting one takes it out of the batch — the counts on BOTH answers move
  // together, because either is a decision about the same chosen set.
  const first = card.locator('.slipped-item').filter({ hasText: titles[0]! });
  await first.locator('input[type=checkbox]').uncheck();
  await expect(card.locator('.slipped-move')).toContainText('Move 1 to today');

  await card.locator('.slipped-move').click();

  // The one that was moved leaves the card; the one held back is still asked
  // about, and — the bug this pins — is selectable again rather than arriving
  // pre-deselected with both buttons dead.
  await expect(card.getByText(titles[1]!)).toBeHidden();
  await expect(card.getByText(titles[0]!)).toBeVisible();
  await expect(card.locator('.slipped-move')).toBeEnabled();

  // Dropping is the honest second answer, and it empties the card.
  await card.locator('.slipped-drop').click();
  await expect(card).toBeHidden();

  // Dropped work is archived, not completed: it disappears from the task list
  // rather than counting as something you got done.
  await go(page, '/tasks');
  await expect(page.locator('.task', { hasText: titles[0]! })).toHaveCount(0);
  await expect(page.locator('.task', { hasText: titles[1]! })).toHaveCount(1);
});

test('calendar: create, edit and undo a delete', async ({ page }) => {
  await go(page, '/calendar');

  const title = `Cal ${Date.now()}`;

  // Create. The composer is a dialog, so nothing is on screen until asked for
  // — the old always-open form pushed the agenda below the fold.
  await page.getByRole('button', { name: /New/ }).click();
  await page.getByPlaceholder('Dentist, standup, gym…').fill(title);
  await page.getByRole('button', { name: '45m' }).click();
  await page.getByRole('button', { name: 'Add event' }).click();

  const row = page.locator('.cal-event', { hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toContainText('45m');

  // Edit — the whole row is the affordance, and the API's PATCH was previously
  // unreachable from the UI entirely.
  await row.click();
  const renamed = `${title} edited`;
  await page.getByPlaceholder('Dentist, standup, gym…').fill(renamed);
  await page.getByRole('button', { name: '1h 30m' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();

  const edited = page.locator('.cal-event', { hasText: renamed });
  await expect(edited).toBeVisible();
  await expect(edited).toContainText('1h 30m');

  // Delete, then take it back.
  await edited.click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.cal-event', { hasText: renamed })).toHaveCount(0);

  await page.locator('.toast-action', { hasText: 'Undo' }).click();
  await expect(page.locator('.cal-event', { hasText: renamed })).toBeVisible();
});

test('calendar: navigating weeks reaches the past and comes back', async ({ page }) => {
  await go(page, '/calendar');

  const strip = page.locator('.cal-strip');
  const selectedBefore = await strip.locator('.cal-day.on .cal-day-num').textContent();

  // The previous agenda hard-filtered anything before today, so yesterday was
  // simply unreachable.
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(strip.locator('.cal-day.is-today')).toHaveCount(0);

  await page.getByRole('button', { name: 'Today' }).click();
  await expect(strip.locator('.cal-day.is-today')).toHaveCount(1);
  await expect(strip.locator('.cal-day.on .cal-day-num')).toHaveText(selectedBefore ?? '');
});

test('fitness: set up a split, then train it', async ({ page }) => {
  await go(page, '/fitness');

  // Describe the split once. Matching is local, so this works with no API key.
  // The prose path is secondary now; tapping exercises is the primary route.
  await page.getByRole('button', { name: /Paste a whole split/ }).click();
  await page.getByLabel('Describe your training split').fill(
    'Push: bench press, incline dumbbell press, lateral raise\nPull: pull up, barbell row',
  );
  await page.getByRole('button', { name: 'Read my split' }).click();

  // A proposal, not a write — nothing is saved until accepted.
  await expect(page.getByText('Bench Press (Barbell)')).toBeVisible();
  await page.getByRole('button', { name: /Save 2 days/ }).click();

  const push = page.locator('.fit-day-chip', { hasText: 'Push' });
  await expect(push).toBeVisible();
  await expect(push).toContainText('3 moves');

  // Starting the day loads its movements as blocks, ready to log.
  await push.click();
  await expect(page.locator('.fit-block-title', { hasText: 'Bench Press (Barbell)' })).toBeVisible();
  await expect(
    page.locator('.fit-block-title', { hasText: 'Incline Bench Press (Dumbbell)' }),
  ).toBeVisible();

  // Weights are in pounds by default, and volume reports in the same unit.
  await expect(page.locator('.fit-active-sub')).toContainText('lb');
  const bench = page.locator('.fit-block', { hasText: 'Bench Press (Barbell)' }).first();
  await expect(bench.locator('.fit-field').first()).toContainText('lb');

  // Typed key by key, NOT with fill(). `fill()` sets the value in one shot and
  // fires a single input event, so it cannot see a field that rejects real
  // keystrokes — which is exactly the failure a person hits first.
  const weightField = bench.getByLabel(/^Weight in lb/);
  const repsField = bench.getByLabel(/^Reps for/);
  // Tapping the field must not change its value. It used to: the fields were
  // wrapped in a <label>, which forwards a click anywhere inside it to its
  // first labelable descendant — the "−" button — so a tap wrote "0" (or "1"
  // for reps) and every typed digit landed after it.
  await weightField.click();
  await expect(weightField).toHaveValue('');
  await weightField.pressSequentially('185');
  await expect(weightField).toHaveValue('185');

  await repsField.click();
  await expect(repsField).toHaveValue('');
  await repsField.pressSequentially('5');
  await expect(repsField).toHaveValue('5');

  // The steppers still work, and are still the one-tap path they exist to be.
  await bench.getByRole('button', { name: /More weight/ }).click();
  await expect(weightField).toHaveValue('190');
  await bench.getByRole('button', { name: /Less weight/ }).click();
  await expect(weightField).toHaveValue('185');

  await bench.getByRole('button', { name: 'Log set' }).click();
  await expect(bench.locator('.fit-set-body')).toContainText('185 lb × 5');
});

test('the nav is three destinations, and every old route still resolves', async ({ page }) => {
  await go(page, '/today');

  // Three, along one axis: now, soon, and how it went. The count IS the
  // feature — eleven peers became four sections, and four sections still hid a
  // tab strip that put the eleven back.
  // The same nav renders twice (sidebar + bottom bar, shown by CSS), so scope
  // to one of them. The sidebar's is first and carries the three; the phone bar
  // carries "Everything" as well, because the sidebar that holds it is hidden
  // below 901px and half the app was otherwise reachable only through search.
  const nav = page.locator('.app-nav').first();
  await expect(nav.locator('.nav-label')).toHaveText(['Today', 'Week', 'Progress']);
  await expect(page.locator('.bottom-nav .nav-label')).toHaveText([
    'Today',
    'Week',
    'Progress',
    'Everything',
  ]);

  // The domain pages are demoted, not deleted. Every one is still reachable.
  await page.goto('/everything');
  for (const label of ['Calendar', 'Tasks', 'Goals', 'Habits', 'Training', 'Writing', 'Money']) {
    await expect(page.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible();
  }

  // Nothing bookmarked broke: every legacy URL still resolves.
  for (const path of ['/goals', '/tasks', '/calendar', '/habits', '/fitness', '/notes', '/journal', '/finance']) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should still load`).toBeLessThan(400);
  }

  // The retired section URLs redirect to their nearest new home rather than 404.
  await page.goto('/plan');
  await expect(page).toHaveURL(/\/week$/);
  await page.goto('/life');
  await expect(page).toHaveURL(/\/everything$/);
  await page.goto('/money');
  await expect(page).toHaveURL(/\/finance$/);

  // Progress and History merged: both land on one "how did it go" screen.
  await page.goto('/progress');
  await expect(page).toHaveURL(/\/progress$/);
  await page.goto('/history');
  await expect(page).toHaveURL(/\/progress$/);
});

test('goals split into short and long term', async ({ page }) => {
  await go(page, '/goals');

  await page.getByLabel('New goal').fill('Run a half marathon');
  await page.getByRole('button', { name: /Add/ }).click();
  await expect(page.locator('.goal-open', { hasText: 'Run a half marathon' })).toBeVisible();

  // A goal with no linked tasks says so rather than showing 0%, which reads as
  // failure when it actually means "not broken down yet".
  await expect(page.locator('.goal-meta').first()).toContainText('nothing linked yet');

  await page.getByRole('button', { name: 'Long term' }).click();
  await page.getByLabel('New goal').fill('Financial independence');
  await page.getByRole('button', { name: /Add/ }).click();

  await expect(page.getByRole('region', { name: 'Short term' }).or(page.locator('section[aria-label="Short term"]'))).toBeVisible();
  await expect(page.locator('section[aria-label="Long term"]')).toContainText('Financial independence');

  // Linking work to a goal is what makes it more than a wish. Task.goalId has
  // existed since the first migration, but nothing ever set it — so a goal read
  // "nothing linked yet" forever and its bar could not fill.
  await expect(page.locator('.goal-meta').first()).toContainText('nothing linked yet');
  await page.locator('.goal-open').first().click();
  await page.getByLabel(/Add a task toward/).fill('Run 5k without stopping');
  await page.locator('.goal-tasks button[type=submit]').click();
  await expect(page.locator('.goal-task span').first()).toContainText('Run 5k');
  // The count is computed server-side, so this also pins that a task mutation
  // refetches goals — without that it stayed at "nothing linked yet".
  await expect(page.locator('.goal-meta').first()).toContainText('0 of 1 done');
  await page.locator('.goal-open').first().click();

  // Moving between horizons is one tap.
  await page
    .locator('.goal-row', { hasText: 'Run a half marathon' })
    .locator('.goal-move')
    .click();
  await expect(page.locator('section[aria-label="Long term"]')).toContainText('Run a half marathon');
});

test('connectors are offered on their own pages, not only in Settings', async ({ page }) => {
  // Connecting your calendar is something you think of while looking at your
  // calendar — hiding it in Settings made it undiscoverable.
  await go(page, '/calendar');
  // On the calendar it is a one-line status row, not a card: setup must not be
  // the loudest thing on the page you opened to read your week. The accessible
  // name is unchanged, which is the contract that matters — the button is still
  // findable by the same query on both surfaces.
  //
  // Google is only offered when the SERVER has an OAuth client — CI has none,
  // and the row deliberately renders nothing rather than a button that cannot
  // work. Assert whichever of those two contracts actually applies here.
  const googleConfigured = await page.evaluate(async () => {
    const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : '/api';
    const res = await fetch(`${base}/connectors/google/status`, { credentials: 'include' });
    return res.ok ? ((await res.json()) as { configured?: boolean }).configured === true : false;
  });
  const googleButton = page.getByRole('button', { name: 'Connect Google Calendar' });
  if (googleConfigured) await expect(googleButton).toBeVisible();
  else await expect(googleButton).toHaveCount(0);

  await go(page, '/finance');
  // Same story as Google: no Plaid credentials on the server means the card
  // says so instead of offering a button that cannot work. CI has none.
  const plaidConfigured = await page.evaluate(async () => {
    const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : '/api';
    const res = await fetch(`${base}/connectors/plaid/status`, { credentials: 'include' });
    return res.ok ? ((await res.json()) as { configured?: boolean }).configured === true : false;
  });
  await expect(
    plaidConfigured
      ? page.getByRole('button', { name: 'Connect a bank' })
      : page.getByText(/no Plaid credentials configured/i),
  ).toBeVisible();
  // Either way the empty state must point at this page, not send you to
  // Settings — that copy is what the whole change was about.
  await expect(page.getByText(/Connect a bank above/)).toBeVisible();

  // Settings still offers both — one component, rendered twice. Settings shows
  // the card unconditionally, so an unconfigured server explains itself there
  // rather than silently omitting the section.
  await go(page, '/settings');
  await page.getByRole('button', { name: /Google Calendar/ }).first().click();
  await expect(
    googleConfigured
      ? page.getByRole('button', { name: 'Connect Google Calendar' })
      : page.getByText(/no Google OAuth client configured/i),
  ).toBeVisible();
});

test('a workout day is built by tapping exercises', async ({ page }) => {
  await go(page, '/fitness');
  // Baseline: no open session, no saved days. Without this the start card is
  // conditionally absent depending on what earlier specs left behind.
  await resetFitness(page);

  // Tapping a list is obvious; describing a split in prose is not.
  await page.getByRole('button', { name: /New workout day/ }).click();
  await page.getByLabel('Workout day name').fill('Arms Day');
  await page.getByLabel('Search exercises to add').fill('bicep curl (dumbbell)');
  await page.locator('.day-option').first().click();
  await expect(page.locator('.day-chosen-row')).toHaveCount(1);

  // A chosen movement leaves the "to add" list — offering it twice is noise.
  // Scoped to the one that was added: the catalog also holds barbell and EZ-bar
  // curls, and those SHOULD still be on offer.
  await expect(
    page.locator('.day-option').filter({ hasText: 'Bicep Curl (Dumbbell)' }),
  ).toHaveCount(0);

  // Order is the order the session opens in, so it has to be changeable.
  await page.getByLabel('Search exercises to add').fill('hammer curl');
  await page.locator('.day-option').first().click();
  await expect(page.locator('.day-chosen-row')).toHaveCount(2);
  await page.locator('.day-chosen-row').last().getByLabel(/Move .* up/).click();
  await expect(page.locator('.day-chosen-name').first()).toContainText('Hammer Curl');

  await page.getByRole('button', { name: /^Save/ }).click();
  const day = page.locator('.fit-day-chip', { hasText: 'Arms Day' });
  await expect(day).toBeVisible();
  await expect(day).toContainText('2 moves');

  // Editing an existing day must not mean recreating it.
  await page.getByRole('button', { name: 'Edit Arms Day' }).click();
  await page.getByLabel('Workout day name').fill('Arms');
  await page.getByRole('button', { name: /^Save/ }).click();
  await expect(page.locator('.fit-day-chip', { hasText: 'Arms' })).toBeVisible();
  await expect(page.locator('.fit-day-chip', { hasText: 'Arms Day' })).toHaveCount(0);
});

test('training progress reports volume, muscle balance and per-lift trend', async ({ page }) => {
  await go(page, '/fitness');
  await resetFitness(page);
  // Seed its own history rather than relying on earlier specs having logged
  // something: that coupling passes in a full run and fails alone, which is
  // the worst way round because it hides in green.
  await seedWorkoutHistory(page);

  await page.getByRole('button', { name: 'Progress', exact: true }).click();

  await expect(page.getByText('Weekly volume')).toBeVisible();
  await expect(page.getByText('Muscles trained')).toBeVisible();
  await expect(page.getByText('Every lift')).toBeVisible();

  // Sets, not volume — volume would call one deadlift a full leg day.
  await expect(page.locator('.tp-muscle-n').first()).toContainText('sets');

  // Each lift expands to its own estimated-1RM trend.
  await page.locator('.tp-lift-head').first().click();
  await expect(page.locator('.tp-lift-detail')).toBeVisible();
  await expect(page.locator('.tp-lift-detail')).toContainText(/estimated max|trend appears/);
});

test('search finds your own data across domains', async ({ page }) => {
  await go(page, '/tasks');
  const marker = `Zephyr${Date.now()}`;
  await page.getByLabel('New task title').fill(`Book ${marker} appointment`);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(`Book ${marker} appointment`)).toBeVisible();

  // ⌘K used to jump to PAGES only. An app whose pitch is that it remembers
  // everything has to let you ask what it remembers.
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByPlaceholder(/Search|Type/i).first().fill(marker);

  const hit = page.locator('.command-item', { hasText: marker });
  await expect(hit.first()).toBeVisible();
  await hit.first().click();
  await expect(page).toHaveURL(/\/tasks$/);
});

test('capture updates the page it was typed on, without a reload', async ({ page }) => {
  await go(page, '/calendar');

  // Capture can write to any domain, so every cached view is potentially
  // stale afterwards. This path used to invalidate only ['timeline'] (the
  // dock) or nothing at all (the command bar) — so telling Atlas "I should be
  // studying 8-9:30" wrote the event, showed a success toast, and left the
  // page insisting nothing was scheduled until you reloaded by hand.
  const title = `Study ${Date.now()}`;
  await page.getByRole('button', { name: /New/ }).click();
  await page.getByPlaceholder('Dentist, standup, gym…').fill(title);
  await page.getByRole('button', { name: 'Add event' }).click();
  await expect(page.locator('.cal-event', { hasText: title })).toBeVisible();

  // The dock writes through a different mutation than the page's own form, so
  // pin that its result lands too.
  const marker = `Dock${Date.now()}`;
  await page.getByLabel('Capture anything').fill(`Remember that ${marker} is my exam code`);
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toBeVisible({ timeout: 20_000 });
});

test('the weekly review can be asked for, not only waited for', async ({ page }) => {
  await go(page, '/progress');

  // The proactive engine writes one on a schedule and Progress has always
  // displayed it — but nothing could REQUEST one, so a new account (or one
  // with proactive off) saw an empty card with nothing to press.
  await expect(page.getByRole('button', { name: /Write my weekly review/ })).toBeVisible();
});

test('an existing task can be attached to a goal, and completing it fills the bar', async ({
  page,
}) => {
  // A goal could only ever gain tasks created from inside the goal, so the
  // ordinary case — the task already exists, and only later do you realise
  // what it is for — had no path at all. This walks that path end to end.
  const marker = `Atlas${Date.now()}`;
  const goalTitle = `Ship ${marker}`;
  const taskTitle = `Write ${marker} release notes`;

  await go(page, '/goals');
  await page.getByLabel('New goal').fill(goalTitle);
  await page.getByRole('button', { name: /Add/ }).click();
  await expect(page.locator('.goal-open', { hasText: goalTitle })).toBeVisible();

  await go(page, '/tasks');
  await page.getByLabel('New task title').fill(taskTitle);
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  const row = page.locator('.task', { hasText: taskTitle });
  await expect(row).toBeVisible();

  // Both the link and the completion are optimistic, so the row is already
  // showing the new state while the write is still in flight — and navigating
  // aborts it. Wait for the server to actually answer before leaving the page.
  const wrote = (method: string) =>
    page.waitForResponse((r) => /\/tasks\//.test(r.url()) && r.request().method() === method);

  // The link control is quiet until the row is hovered, so that a list of
  // unlinked tasks does not read as a column of unanswered prompts.
  await row.hover();
  await row.getByRole('button', { name: 'Link this task to a goal' }).click();
  const linked = wrote('PATCH');
  await page.locator('.task-goal-menu button', { hasText: goalTitle }).click();
  await linked;

  // Linked reads as a chip on the row itself — the point of the link is to see
  // it while you work, not only from the goals page.
  await expect(row.locator('.task-goal-name')).toHaveText(goalTitle);

  await go(page, '/goals');
  const goalRow = page.locator('.goal-row', { hasText: goalTitle });
  await expect(goalRow.locator('.goal-meta')).toContainText('0 of 1 done');

  // Completing is the one action that moves the bar, and the goals query was
  // not invalidated on complete — so the bar sat still at exactly the moment
  // the movement was earned.
  await go(page, '/tasks');
  const completed = wrote('POST');
  await row.locator('.check').click();
  await completed;
  await go(page, '/goals');
  await expect(goalRow.locator('.goal-meta')).toContainText('1 of 1 done');

  // Unlinking has to walk the count back down, which is the same invalidation
  // in the other direction. Completed work is collapsed behind its own toggle,
  // and the chip is deliberately still there on a finished row — seeing the
  // goal a completed task fed is the whole payoff for having linked it.
  await go(page, '/tasks');
  await page.locator('.done-toggle').click();
  await expect(row.locator('.task-goal-name')).toHaveText(goalTitle);

  await row.hover();
  await row.getByRole('button', { name: `Goal: ${goalTitle} — change` }).click();
  const unlinked = wrote('PATCH');
  await page.getByRole('button', { name: 'Remove from goal' }).click();
  await unlinked;
  await expect(row.locator('.task-goal-name')).toHaveCount(0);

  await go(page, '/goals');
  await expect(goalRow.locator('.goal-meta')).toContainText('nothing linked yet');
});

test('Today connects two domains, and stays quiet when it cannot', async ({ page }) => {
  // Own baseline: with nothing recorded at all, Today is the onboarding wizard
  // and there is no day view to put a card on. Depending on an earlier spec to
  // have left data behind is the failure that passes in a full run and fails
  // alone — green, and hiding.
  await go(page, '/tasks');
  await page.getByLabel('New task title').fill(`Connection baseline ${Date.now()}`);
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await go(page, '/today');

  // The differentiator: everything else on Today reports one domain, this
  // compares two. On a fresh account there is nothing honest to compare, and
  // the card says exactly what is missing rather than inventing a pattern —
  // that restraint is the property worth pinning, because a correlation drawn
  // from four days is indistinguishable from a real one to the person reading.
  const card = page.locator('.conn-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText(/two weeks of history|journal on a few more days/);

  // Whatever it says, it must never be a headline claim on this much data.
  await expect(card.locator('.conn-headline')).toHaveCount(0);
});

test('every route renders clean at phone width, with no console errors', async ({ page }) => {
  // A whole-app sweep in one spec. The suite tests behaviour surface by
  // surface; this asks the blunter question — does anything throw, 404, or
  // burst the viewport — across every route at once. It found nothing the day
  // it was written, which is the point: it is a tripwire, not a diagnosis.
  const ROUTES = [
    '/today', '/tasks', '/calendar', '/goals', '/habits', '/journal', '/notes',
    '/fitness', '/finance', '/progress', '/everything', '/week', '/settings',
  ];

  // Its own baseline. This spec asserts the capture dock on every route, and the
  // dock is hidden while the first-run wizard owns the screen — so on an account
  // with nothing in it, every route "fails". It passed only because earlier
  // specs happened to leave data behind, which is the shape the file's own rules
  // forbid: green in a full run, red alone. One task is enough to be past first
  // run. Seeded before the listeners below so its requests are not collected.
  await go(page, '/today');
  await page.evaluate(async () => {
    await fetch('http://localhost:4000/tasks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Sweep baseline ${Date.now()}`, priority: 'LOW' }),
    });
  });

  const problems: string[] = [];
  page.on('console', (m) => {
    // Cloudflare's RUM beacon is blocked locally and is not ours.
    if (m.type() === 'error' && !m.text().includes('cdn-cgi/rum')) {
      problems.push(`console on ${page.url()}: ${m.text().slice(0, 120)}`);
    }
  });
  page.on('pageerror', (e) => problems.push(`uncaught on ${page.url()}: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });

  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ROUTES) {
    // Not go(): that helper asserts the sidebar user name is VISIBLE, and the
    // sidebar is deliberately hidden at phone width. The capture dock is the
    // right signed-in signal here — it is on every page by design.
    await page.goto(route);
    await expect(page.getByLabel('Capture anything')).toBeAttached();
    await page.waitForLoadState('networkidle');

    // Horizontal overflow at phone width is the single most common way a
    // surface breaks here — two date inputs side by side already did it once.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(1);

    const body = (await page.locator('body').innerText()).trim();
    expect(body.length, `${route} rendered almost nothing`).toBeGreaterThan(40);
    expect(body, `${route} shows an error state`).not.toMatch(/something went wrong|application error/i);

    // A route that never finishes loading passes every check above: it throws
    // nothing, returns no 500, fits the viewport, and a wall of skeletons is
    // easily more than 40 characters of body text. So it has to be asserted
    // directly.
    //
    // This is not hypothetical. The screenshot rig — the tool this project uses
    // to look at its own design — photographed a full-page "Waking Atlas…"
    // splash for two routes and a screen of skeletons for Today, in two
    // consecutive runs, and nothing anywhere went red. Design work was being
    // done from pictures of spinners.
    //
    // networkidle has already been awaited above, so anything still loading
    // here is stuck rather than slow.
    // The capture box must not be showing a clipped line. It is on every route
    // by design, so a placeholder or a padding change that makes its content
    // taller than the box leaves the top of a second line poking out under the
    // border — which is what shipped: a 66-character placeholder in a 284px
    // input, scrollHeight 64 against clientHeight 40.
    const capture = await page.evaluate(() => {
      const t = document.querySelector('.home-capture-input') as HTMLTextAreaElement | null;
      if (!t || t.value !== '') return null;
      return { scrollH: t.scrollHeight, clientH: t.clientHeight };
    });
    if (capture) {
      expect(
        capture.scrollH,
        `${route}: the empty capture box overflows (${capture.scrollH}px of content in ${capture.clientH}px)`,
      ).toBeLessThanOrEqual(capture.clientH);
    }

    const stuck = await page.evaluate(() => ({
      skeletons: document.querySelectorAll('.skeleton').length,
      splash: document.body.innerText.includes('Waking Atlas'),
    }));
    expect(stuck.splash, `${route} is still on the boot splash`).toBe(false);
    expect(stuck.skeletons, `${route} still shows ${stuck.skeletons} skeleton(s)`).toBe(0);

    // Axe, on every route, at the width most people use.
    //
    // Three surfaces were scanned before this — Today, Progress, and the
    // week grid — and the moment the grid was added to that list it turned up
    // eight serious violations that had shipped. Scanning three of thirteen
    // routes is how the other ten stay broken quietly. The whole violation list
    // again, not just the serious ones: filtering by impact is exactly how
    // meta-viewport hid for months.
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    for (const v of scan.violations) {
      problems.push(
        `a11y on ${route}: ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes[0]?.target.join(' ')}`,
      );
    }

    // Target size (WCAG 2.2 SC 2.5.8), measured rather than scanned. The tags
    // above are 2.0/2.1 and `target-size` is a wcag22aa rule, so every scan in
    // this suite was blind to it — which is how the goals check button shipped
    // at 16x6: its box was scoped to `.goal-row.done`, so the control that marks
    // a goal achieved only became tappable once the goal already was.
    const tiny = await page.evaluate(() => {
      const SEL =
        'button, a[href], input, select, textarea, [role="button"], [role="checkbox"], [role="tab"], [role="option"], summary';
      const out: string[] = [];
      for (const el of document.querySelectorAll(SEL)) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        // No inline-link exemption. 2.5.8 allows one, but every link on these
        // thirteen routes is a control rather than prose — "Track a habit" sits
        // in a sentence and is still the only thing to tap on an empty Today.
        // An exception that never legitimately fires is just a place for a real
        // one to hide, which is the same lesson as scanning axe by impact.
        if (r.width < 24 || r.height < 24) {
          const name = el.getAttribute('aria-label') || el.textContent?.trim() || '';
          out.push(`${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName.toLowerCase()}.${el.className} "${name.slice(0, 40)}"`);
        }
      }
      return out;
    });
    for (const t of tiny) problems.push(`target size on ${route}: ${t}`);
  }

  expect(problems, problems.join('\n')).toEqual([]);
});

test('Atlas keeps a visible record of what it changed, and it is reversible', async ({ page }) => {
  await go(page, '/today');

  // Capture writes through the AI, which returns a server-built inverse for
  // every write. Until now that inverse was offered ONLY inside a toast, so
  // the record of what an AI did to your data lasted about four seconds.
  const marker = `Ledger${Date.now()}`;
  await page.getByLabel('Capture anything').fill(`Remind me to ${marker} tomorrow`);
  await page.keyboard.press('Enter');
  // More than one toast can be on screen; the newest is the one that answers.
  await expect(page.locator('.toast').first()).toBeVisible({ timeout: 25_000 });

  const strip = page.locator('.chg-strip');
  // With no API key the strip stays empty, but NOT because the capture failed:
  // it falls back to a local parse and really writes the row. There is simply
  // no server-built inverse to offer, because no tool ran. So the honest branch
  // asserts the write happened — this used to demand an error message, and went
  // green for months against a capture box that wrote nothing at all.
  if ((await strip.count()) === 0) {
    await expect(page.locator('.toast').first()).not.toContainText(/could not|needs an API key/i);
    await go(page, '/tasks');
    await expect(page.getByText(marker).first()).toBeVisible({ timeout: 15_000 });
    return;
  }

  await expect(strip).toContainText('What Atlas changed');
  const first = strip.locator('.chg-item').first();
  await expect(first).toBeVisible();

  const undo = first.locator('.chg-undo');
  if (await undo.count()) {
    await undo.click();
    // Marked, not removed: a row that vanishes leaves you unsure it worked.
    await expect(first).toHaveClass(/undone/);
    await expect(first.locator('.chg-state')).toHaveText('undone');
  }
});

test('the weekly review ends in a decision, not just a paragraph', async ({ page }) => {
  // A goal with no work attached can never move its own progress bar — that is
  // a decision, and the review is where it belongs. Atlas's prose is
  // commentary; this is the half you can act on.
  const marker = `Decide${Date.now()}`;
  await go(page, '/goals');
  await page.getByLabel('New goal').fill(`Ship ${marker}`);
  await page.getByRole('button', { name: /Add/ }).click();
  await expect(page.locator('.goal-open', { hasText: marker })).toBeVisible();

  await go(page, '/progress');
  const decide = page.locator('.wk-decide');
  await expect(decide).toBeVisible();
  await expect(decide).toContainText('Worth deciding');

  // The list is capped at three, and work that slipped always outranks a goal
  // — leaving anything else in the way is how a review becomes a chore. Settle
  // it, which is also the point: these buttons act.
  const moveToToday = decide.getByRole('button', { name: /Move to today/ });
  if (await moveToToday.count()) {
    await moveToToday.click();
    await expect(page.locator('.toast').first()).toBeVisible();
    await expect(decide.getByRole('button', { name: /Move to today/ })).toHaveCount(0);
  }

  await expect(decide).toContainText(`Ship ${marker}`);
  await expect(decide).toContainText('no work attached');

  // Every row carries the button that resolves it.
  const breakDown = decide
    .locator('.wk-decide-item', { hasText: marker })
    .getByRole('link', { name: /Break it down/ });
  await expect(breakDown).toBeVisible();
  await breakDown.click();
  await expect(page).toHaveURL(/\/goals$/);
});

test('capture works on day one, before any AI key exists', async ({ page }) => {
  // The cold-start gate. Capture is the one interaction Atlas asks everyone to
  // learn, and it used to route entirely through the model — so a brand-new
  // account, which has no DeepSeek key, met an error at the exact moment the
  // product was meant to prove itself. This account has no key either.
  const marker = `Coldstart${Date.now()}`;
  await go(page, '/today');

  await page.getByLabel('Capture anything').fill(`${marker} at 6`);
  await page.keyboard.press('Enter');
  // Whatever happens, it must not be a failure the user has to interpret.
  await expect(page.locator('.toast').first()).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('.toast').first()).not.toContainText(/could not file/i);

  // "at 6" is an evening event, not a task — the bare-hour rule. Asserted on
  // the WEEK view, not the day: after 18:00 the parser correctly rolls the
  // event to tomorrow, and a day view would then show nothing. This spec
  // failed at 21:00 having passed all afternoon, which is exactly the
  // time-bomb shape the suite is supposed to refuse.
  //
  // Moving to the week view only closed SIX SEVENTHS of that hole. The grid
  // runs Mon-Sun, so when today is a Sunday, "tomorrow" is in the NEXT week and
  // the event is off-screen — measured, on Sunday 30 Aug 2026 at 18:32 UTC,
  // where this was the only failure in the suite. So the assertion now allows
  // for the event being in either week, which is simply the truth about what
  // "tomorrow" means on a Monday-based grid.
  await go(page, '/week');
  const marked = () => page.getByText(marker).first();
  try {
    await expect(marked()).toBeVisible({ timeout: 8_000 });
  } catch {
    await page.getByLabel('Next week').click();
    await expect(marked()).toBeVisible({ timeout: 15_000 });
  }

  // A sentence with no time still lands, as a plain task.
  await go(page, '/today');
  await page.getByLabel('Capture anything').fill(`${marker} groceries`);
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast').first()).toBeVisible({ timeout: 25_000 });

  await go(page, '/tasks');
  await expect(page.getByText(`${marker} groceries`).first()).toBeVisible({ timeout: 15_000 });
});

test('writing is one surface: a dated entry, or something Atlas remembers', async ({ page }) => {
  // Journal and Notes were separate destinations that looked identical from
  // outside — one dated, one not, and neither page said so. That was a decision
  // the product made the user take before they could write a sentence down.
  const marker = `Write${Date.now()}`;
  await go(page, '/journal');
  await expect(page.getByRole('heading', { name: 'Writing' })).toBeVisible();

  // Default is a dated entry, and mood belongs to a day.
  //
  // Typed, not filled. fill() sets the DOM value and dispatches a single input
  // event; a React controlled input can miss it, leaving `body` empty so save()
  // returns early and NO request is made. It is the same lesson as the weight
  // field: a box a person types into has to be tested by typing.
  //
  // And the assertion is scoped to `.wr-list`, not to any `.card`. React mirrors
  // a controlled textarea's value into the element's text content, so a bare
  // `.card` + hasText matched the COMPOSER — it went green the instant the text
  // was typed, the test navigated on, and the navigation cancelled the in-flight
  // POST. Measured: zero journal rows in the database after a "passing" run.
  const box = page.getByLabel('What are you writing?');
  await box.click();
  await box.pressSequentially(`${marker} today was fine`);
  await page.getByRole('button', { name: 'Mood 4 out of 5' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(
    page.locator('.wr-list .card', { hasText: `${marker} today was fine` }),
  ).toBeVisible({ timeout: 15_000 });

  // Ticking the box switches to a durable fact, and mood disappears with it —
  // a standing note has no day for a mood to belong to.
  // Reloaded between the two writes. Toggling the mode and typing again in the
  // same render pass raced the controlled input — the DOM held the text while
  // React's state did not, so the submit button stayed disabled and the failure
  // read as a broken button. Coming back to the page is what a person does
  // anyway, and it tests the same two paths without the race.
  await go(page, '/journal');
  await page.getByLabel(/always remember this/).check();
  await expect(page.getByLabel('What this note is about')).toBeVisible();
  // Mood belongs to a day; a standing fact has no day for one to belong to.
  await expect(page.getByRole('button', { name: 'Mood 4 out of 5' })).toHaveCount(0);

  const noteBox = page.getByLabel('What are you writing?');
  await noteBox.click();
  await noteBox.pressSequentially(`${marker} knee note`);
  await page.getByRole('button', { name: 'Save' }).click();
  // Same scoping, same reason.
  await expect(page.locator('.wr-list .card', { hasText: `${marker} knee note` })).toBeVisible({
    timeout: 15_000,
  });

  // Both live in one list, and /notes is the same surface — no bookmark broke.
  // Attached rather than visible: on an account with a long history the older
  // of the two is below the fold, and "is it on this page" is the claim here,
  // not "is it in the viewport".
  await go(page, '/notes');
  await expect(page.locator('.wr-list', { hasText: `${marker} today was fine` })).toBeAttached();
  await expect(page.locator('.wr-list', { hasText: `${marker} knee note` })).toBeAttached();
});

test('the week is a grid: seven columns, positioned events, and a way into a day', async ({
  page,
}) => {
  // "Week" used to be an agenda grouped by day — which answers "what is next",
  // the question Today already answers, and never answers the one worth opening
  // seven days for: where the week is packed, where it is empty, what collides.

  // Its own baseline. The grid renders whatever the week holds, so this spec
  // creates the event it asserts on rather than hoping one is there.
  await go(page, '/calendar');
  const title = `Grid ${Date.now()}`;
  await page.getByRole('button', { name: /New/ }).click();
  await page.getByPlaceholder('Dentist, standup, gym…').fill(title);
  // Midday, explicitly. The composer defaults to "the next half hour", which
  // rolls into TOMORROW when the suite runs near midnight — the event would
  // then be created on a day this page is not showing, and the spec would fail
  // for an hour a day. Fixed at noon it lands on the selected day whenever the
  // suite runs, which is the rule for every assertion in this file.
  await page.getByLabel('Starts').fill('12:00');
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await page.getByRole('button', { name: 'Add event' }).click();
  // 15s: the axe sweep runs just before this and the machine is loaded, so the
  // default 5s has flaked once here.
  await expect(page.locator('.cal-event', { hasText: title })).toBeVisible({ timeout: 15_000 });

  await go(page, '/week');

  // Seven day columns and seven headers — the shape of the week, not a list.
  await expect(page.locator('.wk-col')).toHaveCount(7);
  await expect(page.locator('.wk-day')).toHaveCount(7);

  // The event is placed IN the grid, with a real height. A block with no height
  // is the failure mode that matters: it renders, it is findable, and it tells
  // you nothing about when the thing happens.
  const block = page.locator('.wk-event', { hasText: title });
  await expect(block).toBeVisible();
  const box = await block.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(8);

  // The strip above is gone in week scope: the grid's own header is the strip,
  // and two identical seven-day pickers stacked is just two of them stacked.
  await expect(page.locator('.cal-strip')).toHaveCount(0);

  // The whole violation list, not just the serious ones — filtering to
  // serious/critical is how meta-viewport hid for months. The grid is the
  // largest new surface in the app and was going unscanned.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations.map((v) => `${v.id} (${v.impact})`), null, 2),
  ).toEqual([]);

  // A day header is the way down into one day, and that brings the strip back.
  await page.locator('.wk-day').first().click();
  await expect(page.locator('.wk-col')).toHaveCount(0);
  await expect(page.locator('.cal-strip')).toHaveCount(1);
});

test('clicking an empty slot in the week grid starts an event at that time', async ({ page }) => {
  // The composer used to open at "the next half hour", wherever you clicked —
  // so putting something on Thursday afternoon meant retyping the day and the
  // time you had just pointed at.
  await go(page, '/week');

  const column = page.locator('.wk-col').nth(2);
  const box = await column.boundingBox();
  if (!box) throw new Error('week grid did not render a third column');

  // A quarter of the way down the visible window, whatever that window is —
  // the range adapts to the week's own events, so an absolute hour would make
  // this assertion depend on what other specs left behind.
  await column.click({ position: { x: box.width / 2, y: box.height / 4 } });

  const time = page.getByLabel('Starts');
  await expect(time).toBeVisible();
  // Snapped to the quarter hour: nobody means 9:07.
  expect(await time.inputValue()).toMatch(/^\d{2}:(00|15|30|45)$/);

  // And it is the day that was clicked — the third column — not whichever day
  // happened to be selected.
  const wanted = await page.evaluate(() => {
    const d = new Date();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const target = new Date(monday);
    target.setDate(monday.getDate() + 2);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${target.getFullYear()}-${p(target.getMonth() + 1)}-${p(target.getDate())}`;
  });
  await expect(page.getByLabel('Date')).toHaveValue(wanted);

  await page.keyboard.press('Escape');
});

test('⌘K reaches the destinations the app actually has', async ({ page }) => {
  await go(page, '/today');

  // The command bar kept its own copy of the nav and never got the restructure,
  // so the app's three primary destinations were unreachable from its own
  // command bar while two folded-away screens were still offered.
  const open = async (term: string) => {
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByRole('combobox', { name: 'Command input' });
    await expect(input).toBeVisible();
    await input.fill(term);
    return input;
  };

  await open('week');
  await page.getByRole('option', { name: 'Go to Week' }).click();
  await expect(page).toHaveURL(/\/week$/);

  await open('money');
  await page.getByRole('option', { name: 'Go to Money' }).click();
  await expect(page).toHaveURL(/\/finance$/);

  await open('training');
  await page.getByRole('option', { name: 'Go to Training' }).click();
  await expect(page).toHaveURL(/\/fitness$/);

  // And the old vocabulary still lands on whatever replaced it.
  await open('progress');
  await page.getByRole('option', { name: 'Go to Progress' }).click();
  await expect(page).toHaveURL(/\/progress$/);

  await open('notes');
  await page.getByRole('option', { name: 'Go to Writing' }).click();
  await expect(page).toHaveURL(/\/journal$/);
});

test('Atlas can be told what to call you, and stops guessing from your address', async ({
  page,
}) => {
  // `displayName` was on the user record, accepted at registration and patchable
  // through /settings from the start, and no screen ever set it — so it was null
  // for every account and Today greeted people with their email's local part.
  // The suite's own accounts are the worst case: "Good morning, e2e-1786…-81051."
  const marker = `Sam${Date.now()}`;

  // Its own baseline: Today shows the first-run wizard, not the greeting, until
  // the account owns something.
  await go(page, '/today');
  await page.evaluate(async () => {
    await fetch('http://localhost:4000/tasks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Greeting baseline ${Date.now()}`, priority: 'LOW' }),
    });
  });

  // A generated address yields no name at all, which is the point: better to
  // greet you with nothing than with a timestamp.
  await go(page, '/today');
  const hello = page.locator('.hero-brief-greeting');
  await expect(hello).toBeVisible();
  await expect(hello).not.toContainText('e2e-');
  await expect(hello).toHaveText(/^(Good morning|Good afternoon|Good evening|Up late)\.$/);

  await go(page, '/settings');
  await page.getByRole('button', { name: /Your name/ }).click();
  const field = page.getByRole('textbox', { name: 'Your name' });
  await field.click();
  await field.pressSequentially(marker);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // Wait for the save to be CONFIRMED before navigating. Clicking Save and
  // leaving in the same breath cancels the in-flight PATCH, so this spec used
  // to fail against a working app — and a real person doing the same thing lost
  // their name with nothing on screen to say so, which is why the field now
  // confirms at all.
  await expect(page.locator('.field-saved')).toContainText('Saved');

  // Today follows, and so does the sidebar — both read /auth/me rather than the
  // settings response, so this is really asserting that saving invalidates it.
  await go(page, '/today');
  await expect(page.locator('.hero-brief-greeting')).toContainText(marker);
  await expect(page.locator('.sidebar-user-name')).toHaveText(marker);
});

test('a habit can be renamed and retargeted after you have made a typo', async ({ page }) => {
  // Habits had PATCH on the API and nothing in the UI, so a habit was whatever
  // you called it the first time — a typo was permanent unless you archived the
  // streak and started again.
  const marker = `Wter${Date.now()}`;
  const fixed = `Water${Date.now()}`;

  await go(page, '/habits');
  // Its own baseline: this spec creates the habit it edits.
  const newHabit = page.getByLabel('New habit name');
  await newHabit.click();
  await newHabit.pressSequentially(marker);
  // exact: the sidebar's "Ask or add… ⌘K" also contains "Add", and role-name
  // matching is a substring by default.
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: `Edit habit "${marker}"` })).toBeVisible();

  // The name IS the edit affordance.
  await page.getByRole('button', { name: `Edit habit "${marker}"` }).click();

  const nameField = page.getByRole('textbox', { name: 'Name' });
  await expect(nameField).toBeVisible();
  // Typed, not filled. Both of these are controlled inputs, and this file has
  // been bitten twice by fill() dispatching one event a commit can miss.
  await nameField.click();
  await nameField.press('ControlOrMeta+a');
  await nameField.pressSequentially(fixed);

  const targetField = page.getByRole('spinbutton', { name: 'Times per day' });
  await targetField.click();
  await targetField.press('ControlOrMeta+a');
  await targetField.pressSequentially('8');

  await page.getByRole('button', { name: 'Save' }).click();

  // The whole card follows the rename, not just the heading.
  await expect(page.getByRole('button', { name: `Edit habit "${fixed}"` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Check in "${fixed}"` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Archive "${fixed}"` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Edit habit "${marker}"` })).toHaveCount(0);

  // Reloaded, because the assertions above could all be satisfied by component
  // state that never reached the server.
  await go(page, '/habits');
  await expect(page.getByRole('button', { name: `Edit habit "${fixed}"` })).toBeVisible();
  await expect(page.locator('.habit-card', { hasText: fixed })).toContainText('0/8 today');
});

test('losing the network shows the offline shell, and regaining it gives the app back', async ({
  browser,
}) => {
  // Its OWN context, deliberately. Every other spec in this file shares one
  // signed-in context, and a service worker registered into that would outlive
  // this test and sit in front of every request the rest of the suite makes.
  // Same session (so the app renders rather than the gate), separate lifetime.
  // browser.newContext() does not inherit the config's `use`, so baseURL is
  // resolved the same way playwright.config.ts resolves it.
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    storageState: STATE,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  try {
    await page.goto('/');
    // Registered here rather than waiting for ServiceWorkerRegistrar, which is
    // a deliberate no-op outside production — this way the spec tests sw.js
    // itself and passes against a dev server and a built one alike.
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });

    // The fallback is only a fallback if install actually precached it.
    const shells = await page.evaluate(async () => {
      const names = await caches.keys();
      const found: string[] = [];
      for (const n of names) {
        const c = await caches.open(n);
        for (const r of await c.keys()) found.push(new URL(r.url).pathname);
      }
      return found;
    });
    expect(shells).toContain('/offline.html');

    await context.setOffline(true);
    await page.goto('/today');
    // A PWA that lives on a home screen must say something when the signal goes.
    // Measured before this existed: an empty body, on a white page.
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.locator('body')).toContainText("You're offline");

    // And it must let go again. The offline page getting STUCK in front of a
    // working app is not hypothetical here: the same fetch handler once served
    // it to online users because it followed the Google OAuth callback's
    // redirect and the browser refuses a redirected response for a navigation.
    await context.setOffline(false);
    await page.goto('/today');
    // The signed-in shell, not the dock: whether /today shows the day or the
    // first-run wizard depends on what this account happens to own, and the
    // claim here is only "the real app came back".
    await expect(page.locator('.sidebar-user-name')).toBeVisible();
    await expect(page.locator('body')).not.toContainText("You're offline");
  } finally {
    await context.close();
  }
});

test('a failed request never mistakes an established account for a brand-new one', async ({
  page,
}) => {
  // The first-run gate asks "do you have nothing?", and it used to ask it of
  // `data?.length ?? 0` the moment the queries stopped being pending. A query
  // that FAILS leaves data undefined, which that expression cannot tell apart
  // from an empty account — so a single bad response put the three-step setup
  // wizard over the top of a real user's day. It is the highest-cost way to get
  // this wrong, because the wizard exists to WRITE a routine: the offered
  // recovery from a dropped request was a flow that overwrites the working week
  // you already had.
  //
  // Its own baseline, per the file's rule: this account must genuinely own
  // something, or "no wizard" would prove nothing.
  const marker = `Established${Date.now()}`;
  await go(page, '/today');
  await page.evaluate(async (title) => {
    await fetch('http://localhost:4000/tasks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, priority: 'MEDIUM' }),
    });
  }, marker);

  // Fail all four gate queries, the way a 429 burst from the 120/min throttler
  // or an API restart does — they do not politely pick one endpoint. Matched on
  // the exact pathname because /events carries a from/to query string, and a
  // glob written for the bare path silently misses it: with tasks alone still
  // answering, the gate is false either way and this spec passes against the
  // very bug it exists to catch.
  await page.route(
    (url) => /^\/(tasks|habits|events|routine)$/.test(url.pathname),
    (route) => route.abort('failed'),
  );

  await page.goto('/today');

  // Wait PAST the retry policy before asserting. Queries retry twice with a
  // 1s/2s backoff, so for the first few seconds they are still 'pending' and the
  // gate is correctly false no matter how it is written — measured on the real
  // app, the wizard only took over between t+3s and t+7s, and an assertion at
  // t+2s passes against the bug just as happily as against the fix. Once it
  // appears it stays (still there at t+15s), so one look after the window is
  // enough; toHaveCount(0) would otherwise pass on the very first sample.
  await page.waitForTimeout(8_000);

  // The wizard owns the screen when it renders, so its absence is the claim.
  await expect(page.locator('.onb')).toHaveCount(0);
  // And the real surface is what came back instead — the dock is on every page.
  await expect(page.getByLabel('Capture anything')).toBeAttached();
});

test('Progress explains what it would need before it will claim a pattern', async ({
  page,
}) => {
  // The payoff for the daily mood tap, and the thing most able to embarrass
  // Atlas: a confident claim about why someone feels bad, drawn from a handful
  // of days. So the behaviour worth pinning is the REFUSAL — with one day of
  // mood logged it must say how far off it is, and must not name a pattern.
  //
  // Self-seeding on purpose. Another spec in this file logs a mood, so leaning
  // on that would pass in a full run and fail alone — the shape that hides in
  // green. This logs its own, which also makes the assertion exact: every entry
  // lands on today, so exactly one day is ever logged.
  const marker = `Pat${Date.now()}`;
  await go(page, '/journal');
  const box = page.getByLabel('What are you writing?');
  await box.click();
  await box.pressSequentially(`${marker} a day with a mood on it`);
  await page.getByRole('button', { name: 'Mood 4 out of 5' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.wr-list .card', { hasText: marker })).toBeVisible({
    timeout: 15_000,
  });

  await go(page, '/progress');
  const card = page.locator('.mood-patterns');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText(/1 of 14 days logged/);
  // Nothing may be asserted about the user from one day. If a line ever renders
  // here, the thresholds have been lowered and the feature has become a
  // horoscope.
  await expect(card.locator('.mood-patterns-item')).toHaveCount(0);

  // The range chips must not be able to change the sample. The server decides
  // how far back a comparison looks precisely so a narrower window cannot shrink
  // it until a coincidence clears the bar.
  await page.getByRole('button', { name: 'Year' }).click();
  await expect(card).toContainText(/1 of 14 days logged/);
});

test('Atlas asks how you are at your own waking and bedtime, not the clock', async ({ page }) => {
  // Mood is the only thing Atlas cannot derive from use, and it is asked TWICE
  // a day on purpose: one reading says how a day went, two bracket it, and the
  // difference between them is what the hours in between did to you. That pair
  // is what the patterns on Progress compare against.
  //
  // Self-seeding twice over, and independent of when it runs. The routine is
  // written relative to NOW so "now" lands inside the evening window whatever
  // the hour — a spec that only passes in the evening is a time bomb. And the
  // moods other specs logged (all timestamped now) are cleared first, because
  // they correctly suppress the ask: without that this passed alone and failed
  // in a full run.
  await go(page, '/today');
  await clearTodaysMoods(page);
  const now = new Date();
  const bedMin = ((now.getHours() + 1) * 60 + now.getMinutes()) % 1440;
  await page.evaluate(async (startMin) => {
    const post = (path: string, body: unknown) =>
      fetch(`http://localhost:4000${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    // Today shows the first-run wizard until the account owns something.
    await post('/tasks', { title: `Mood baseline ${Date.now()}`, priority: 'LOW' });
    await post('/routine/blocks', {
      label: 'Sleep',
      kind: 'sleep',
      days: 127,
      startMin,
      endMin: (startMin + 8 * 60) % 1440,
    });
  }, bedMin);

  await go(page, '/today');
  const card = page.locator('.mood-checkin');
  await expect(card).toBeVisible({ timeout: 20_000 });
  // The evening question, because bedtime is an hour away — not the morning one.
  await expect(card).toContainText('How are you ending the day?');
  // And it says WHY it asks twice. Without that this reads as a nag.
  await expect(card).toContainText(/this morning/i);

  // One tap files it, with no body: a mood is a legitimate entry on its own.
  await card.getByRole('button', { name: /Good — 4 out of 5/i }).click();
  await expect(card).toHaveCount(0, { timeout: 20_000 });

  // And it stays gone on a fresh load — the ask is per window, not per visit.
  await go(page, '/today');
  await expect(page.locator('.mood-checkin')).toHaveCount(0);
});

/**
 * Supersets: two movements done back to back, with rest only after the round.
 *
 * The rest timer is the whole point, and it is the part that cannot be checked
 * by reading the DOM for a label — a superset that still restarts the clock
 * after each movement is a superset in name only. So this drives the real
 * timer: it lets it run, logs the FIRST movement of the round and asserts the
 * clock kept counting, then logs the LAST and asserts it went back to zero.
 *
 * Own baseline via `resetFitness`, because a workout left open by another spec
 * hides the start card entirely and saved days change what the picker offers.
 */
test('a superset is one round, and the rest timer waits for the end of it', async ({ page }) => {
  await resetFitness(page);
  await go(page, '/fitness');

  await page.getByRole('button', { name: 'New workout day' }).click();
  await page.getByLabel('Workout day name').fill('Superset Day');

  // Whatever the catalog offers under "barbell" — the assertion is about
  // grouping, and naming three exercises would couple it to the catalog.
  await page.getByRole('searchbox', { name: /search exercises to add/i }).fill('barbell');
  const picked: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const option = page.getByRole('option').first();
    await expect(option).toBeVisible({ timeout: 20_000 });
    picked.push((await option.locator('.day-option-name').innerText()).trim());
    await option.click();
  }

  // The control says what it will do to WHICH two movements, so it can be
  // understood without first working out what "link" means here.
  const link = page.locator('.day-link').first();
  await expect(link).toHaveAttribute('aria-label', `Superset ${picked[0]} with ${picked[1]}`);
  await link.click();
  await expect(link).toHaveAttribute('aria-label', `Separate ${picked[0]} from ${picked[1]}`);
  await expect(page.locator('.day-superset-tag')).toHaveCount(2);

  await page.getByRole('button', { name: /^Save/ }).click();
  await expect(page.getByRole('button', { name: 'Start Superset Day' })).toBeVisible({
    timeout: 20_000,
  });

  // It is a stored fact, not a screen state: read it back off the API.
  const stored = await page.evaluate(async () => {
    const base = window.location.hostname === 'localhost' ? 'http://localhost:4000' : '/api';
    const days = (await (
      await fetch(`${base}/fitness/templates`, { credentials: 'include' })
    ).json()) as { name: string; exercises: { supersetGroup: number | null }[] }[];
    return days.find((d) => d.name === 'Superset Day')?.exercises.map((e) => e.supersetGroup);
  });
  expect(stored).toEqual([0, 0, null]);

  await page.getByRole('button', { name: 'Start Superset Day' }).click();
  await expect(page.locator('.fit-active')).toBeVisible({ timeout: 20_000 });

  // The round is drawn as one thing, and says why.
  const round = page.locator('.fit-superset');
  await expect(round).toHaveCount(1);
  await expect(round).toContainText('Superset A');
  await expect(round).toContainText('no rest between these');
  // Exactly the two that were linked, in the order the day plans them.
  await expect(round.locator('.fit-block-title')).toHaveText([picked[0]!, picked[1]!]);

  const seconds = async () => {
    const [mm, ss] = (await page.locator('.rest-clock').innerText()).trim().split(':');
    return Number(mm) * 60 + Number(ss);
  };

  const logSet = async (name: string, weight: string, reps: string) => {
    const block = page.locator('.fit-block').filter({ hasText: name }).first();
    const before = await block.locator('.fit-set').count();
    const fields = block.locator('.fit-field input');
    // Typed, not filled: a controlled input can swallow a one-shot value, and
    // a click alone must change nothing.
    await fields.nth(0).click();
    await fields.nth(0).pressSequentially(weight);
    await fields.nth(1).click();
    await fields.nth(1).pressSequentially(reps);
    await block.getByRole('button', { name: /log set/i }).click();
    await expect(block.locator('.fit-set')).toHaveCount(before + 1, { timeout: 20_000 });
  };

  // Let the clock get somewhere, so a reset would be unmistakable.
  await page.waitForTimeout(4_000);
  const started = await seconds();
  expect(started).toBeGreaterThanOrEqual(3);

  // First movement of the round: you are NOT resting yet, so the clock runs on.
  await logSet(picked[0]!, '100', '5');
  expect(await seconds()).toBeGreaterThanOrEqual(started);

  // Last movement of the round: now you rest, so the clock starts over.
  await logSet(picked[1]!, '80', '8');
  await expect
    .poll(seconds, { timeout: 10_000 })
    .toBeLessThan(started);

  // Leave nothing open behind us — an active session hides the start card for
  // every spec that runs after this one.
  await page.getByRole('button', { name: 'Finish' }).click();
});
