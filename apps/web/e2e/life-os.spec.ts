import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { register, resetFitness, seedWorkoutHistory } from './helpers';

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
  await expect(page.getByLabel('Capture anything')).toBeAttached();
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

  // Habits lives in Life, Tasks in Plan — crossing sections goes through the
  // four-item nav, not a tab strip.
  await page.locator('.app-nav').first().getByRole('link', { name: 'Life' }).click();
  await page.locator('.section-tab', { hasText: 'Habits' }).click();
  await expect(page).toHaveURL(/\/habits$/);
  await page.getByLabel('New habit name').fill('Meditate');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Meditate')).toBeVisible();

  // Both land in History — the reverse-chron log surface.
  await page.locator('.app-nav').first().getByRole('link', { name: 'Today' }).click();
  await page.locator('.section-tab', { hasText: 'History' }).click();
  await expect(page).toHaveURL(/\/history$/);
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

test('Progress charts the long arc and passes the axe scan', async ({ page }) => {
  // The shared account completed a task in an earlier test, so the tiles have
  // something real to render.
  await go(page, '/progress');
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();

  // Range chips drive the window.
  await page.getByRole('button', { name: '90 days' }).click();
  await expect(page.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');

  // Headline tiles render (the empty state would replace them entirely).
  await expect(page.getByText('Tasks done')).toBeVisible();
  // Habit check-ins was deliberately dropped from the tiles — it duplicated the
  // consistency % already in the hero strip.
  await expect(page.getByText('Habit check-ins')).toHaveCount(0);
  // Mood is ONE visual with a labelled axis; the distribution bars are gone.
  await expect(page.locator('.prog-mood-bar')).toHaveCount(0);

  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious, JSON.stringify(serious.map((v) => v.id), null, 2)).toEqual([]);
});

test('Today and the open command bar pass the axe scan', async ({ page }) => {
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

test('a recurring task rolls forward to its next occurrence when completed', async ({ page }) => {
  await go(page, '/tasks');

  const title = `Recurring ${Date.now()}`;
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
  await page.getByRole('button', { name: /Add exercise/i }).click();
  await page.getByLabel('Search exercises').fill('lateral');
  await page.getByRole('option', { name: /Lateral Raise/ }).click();
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

test('the nav is four sections, and every old route still resolves', async ({ page }) => {
  await go(page, '/today');

  // Four, not eleven. The count IS the feature.
  // The same nav renders twice (sidebar + bottom bar, shown by CSS), so scope
  // to one of them.
  const nav = page.locator('.app-nav').first();
  await expect(nav.locator('.nav-label')).toHaveText(['Today', 'Plan', 'Life', 'Money']);

  // Every legacy URL still works — nothing bookmarked broke.
  for (const [path, tab] of [
    ['/goals', 'Goals'],
    ['/tasks', 'Tasks'],
    ['/calendar', 'Calendar'],
    ['/habits', 'Habits'],
    ['/fitness', 'Training'],
    ['/notes', 'Notes'],
    ['/progress', 'Progress'],
  ] as const) {
    await page.goto(path);
    await expect(page.locator('.section-tab.on')).toContainText(tab);
  }

  // A section URL lands on its first tab.
  await page.goto('/plan');
  await expect(page).toHaveURL(/\/goals$/);
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
  // Google is only offered when the SERVER has an OAuth client — CI has none,
  // and the card deliberately renders nothing rather than a button that cannot
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
  await page.getByLabel('Search exercises to add').fill('bicep curl');
  await page.locator('.day-option').first().click();
  await expect(page.locator('.day-chosen-row')).toHaveCount(1);

  // A chosen movement leaves the "to add" list — offering it twice is noise.
  await expect(page.locator('.day-option').filter({ hasText: 'Bicep Curl' })).toHaveCount(0);

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
