# Phase 3: first useful action

## Scope and dependency

This follow-up is split from PR #31 to keep the product journey separate from
mobile geometry and query recovery. It depends on that branch through `87613ba`.
Both PRs target main as requested, so this PR currently includes the unmerged
prerequisite changes. Its own changes are the first-use screen, Today handoff,
regressions and screenshot-rig verification. Nothing is merged or deployed.

## Observed problem and decision

The original onboarding screenshot and current Today gate show sleep/work/provider
setup before capture. The wizard hides the capture dock while active. The new
account therefore has to work through configuration before trying the product's
central interaction, even though capture and day planning already work without AI.

First use now asks for one task or plan through the existing HomeCapture component.
The same mutation, fallback parser, persisted domain rows and cache invalidation
are used as on subsequent days. A successful task/event capture moves the account
into the existing Today view. Routine setup remains an explicit secondary choice;
Settings retains routine and provider configuration after capture. The all-queries-
succeeded empty-account gate remains intact. No new persistence flag, provider,
runtime dependency or alternate capture implementation is introduced.

## Verification

Two first-use regressions were observed red against the automatic wizard: immediate
capture and explicit routine choice. All three focused tests then passed, including
the existing-account failed-read safeguard. The screenshot rig now measures the
fresh account at 390px in both themes, records PNGs, captures a uniquely named task,
checks its saved row id through the real API, verifies no routine was created, and
opens Tasks to verify the saved result. It uses the rig's existing synthetic account
and does not add a registration. Browser results and the new PNG review are pending.

## Remaining work

This is the first step of the redesigned journey, not a claim that onboarding or
Phase 3 is complete. Routine setup's optional provider copy, the post-capture
handoff and capacity guidance still need review. The remaining query-backed
editors, sparse-data Progress interpretation, and Phase 4 measurements are outstanding.

Local gates: build 6/6, forced typecheck 10/10, lint zero errors with three
existing warnings, 1519 unit tests passed. Browser proof and first-use
measurements remain pending CI.

## Optional routine setup follow-up

The routine wizard now asks only about sleep and week structure, then offers
Build my week. Provider connections remain in Settings. This removes the third
step and its obsolete claim that planning requires a key, as well as unverified
price and future-brief promises. The existing routine builder and mutation remain
unchanged. A new regression was observed failing against the three-step flow;
all four focused first-use/routine tests then passed.

The former post-save calendar offer was also removed. Source inspection shows
that the routine mutation immediately populates the cache, making Today stop
rendering first use before that offer can be relied upon. The successful handoff
is now explicitly back to Today, with connections available in Settings. This
is source evidence about the old lifecycle; the new routine browser journey
still needs verification.

Two-step routine local gates: build 6/6, forced typecheck 10/10, lint zero
errors with three existing warnings, 1520 unit tests passed. Browser verification
of this commit remains pending CI.

## Saved-item handoff

The first-capture confirmation now offers Review my tasks for saved tasks and
Open my calendar for saved events, using the existing destination routes. Two
new tests were observed failing before this change; both then passed alongside
eight existing query-state tests. The browser proof now clicks the confirmation
link instead of using page.goto to reach Tasks, so the user-facing transition
itself must work. This lifecycle proof is pending CI, not inferred from the
component tests.

## Existing onboarding browser contract corrected

Run `34226131494` at `1d07336` failed the existing a-onboarding spec: it
expected sleep setup immediately and could not find that heading on the new
capture-first screen. Result: 52 passed, one failed, one skipped. The failure
prevented screenshot execution, so no new first-use visual pass is claimed.

The existing spec now chooses routine setup explicitly, measures both steps in
light and dark at 390px using the shared strict geometry/font/all-axe checker,
and saves the second pass. It retains the original Today handoff and persisted
09:30–17:30 work-hours assertion in Settings. No extra registration or spec was
introduced. This repairs an outdated expectation for the deliberate redesign;
it does not remove the persistence proof. CI verification remains pending.

Final local gates for the handoff and browser-contract correction: build 6/6,
forced typecheck 10/10, lint zero errors with three existing warnings, 1522
unit tests passed. CI and PNG review remain pending for this revision.

## Handoff lifecycle verification

The first-use test now uses the actual FirstCapture and useEstablished hook
rather than mocking both away. A cache-data transition from an empty account
to saved data exits the welcome screen, retains the Review my tasks link across
another render and records the established-account marker. All four tests
passed. This test was green on introduction: it verifies a suspected lifecycle
risk and is not presented as an observed-red regression. Browser and PNG
verification still depend on the corrected CI run.

Lifecycle verification local gates: build 6/6, forced typecheck 10/10, lint
zero errors with three existing warnings, 1523 unit tests passed. The refreshed
query audit ledger tracks 43 query-backed component files without treating
source indicators as verified coverage.

## First rendered proof and selector correction

Run `34226952240` at `00315a4` passed 53 browser tests with one skipped,
independent groups 1 + 1 + 6, and the two-theme routine persistence journey.
The screenshot run then verified first capture persisted, no routine was
created, and the Review my tasks link reached Tasks. Its final text assertion
failed because both the saved task button and the success toast contained the
marker. The assertion now targets `.task-title-btn`, which can only represent
a saved task, preserving the persistence assertion instead of accepting any
matching text.

Artifact `10056333131` contains four PNGs; all four were inspected. The phone
first-use screen fits at 390px, with capture and the optional routine choice
visible without scrolling. Light and dark measurements both recorded zero
overflow, targets below 24px, inputs below 16px and axe violations. The reports
are retained in `docs/evidence/phase-3-first-use.json`. These are completed
measurements from a failed overall screenshot run, not a claimed screenshot
suite pass. The thirteen-route sweep did not execute in this run.

Selector correction local gates: build 6/6, forced typecheck 10/10, lint
zero errors with three existing warnings, 1523 unit tests passed. Corrected
screenshot-suite completion remains pending CI.

Verified completion of the corrected run: `34227770139` at `cd63d41` passed
all CI jobs, 53 browser tests with one skipped, independent groups 1 + 1 + 6,
and the screenshot/measurement spec in 1.4 minutes. Artifact `10056713959`
contains 61 PNGs and 28 measurements (first use plus thirteen routes, both
themes). All measurements recorded zero overflow, undersized targets, undersized
inputs and axe violations. This does not complete the overall Phase 3 state audit.
