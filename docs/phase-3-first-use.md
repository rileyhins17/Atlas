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
