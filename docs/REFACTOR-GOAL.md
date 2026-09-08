# Atlas product redesign and end-to-end refactor

## Active objective — revised by Riley, 7 September 2026

Rethink how Atlas delivers a personal Life OS, design a substantially better
product around the jobs its users need done, and implement that design end to
end to a shippable paid-SaaS standard. This supersedes a cleanup-only outcome.
The task is complete only when the redesigned experience, underlying domain
logic, APIs, persistence, reliability and measured performance work together
and have been verified on the final implementation.

Existing screens, module boundaries and interaction patterns are candidates for
replacement, not design constraints. Preserve users' data and useful existing
capabilities. Behaviour changes are permitted when they implement the deliberate
product redesign; accidental changes and silent capability loss are not.

## Product work required

1. Inspect the current implementation and rendered app. Separate what actually
   works from assumptions in old plans. Record the current experience and its
   measured weaknesses before changing the UI.
2. Develop a concrete product thesis: who Atlas serves, what recurring job
   brings them back, how the domains cooperate, and what makes the experience
   meaningfully better than a collection of trackers and an AI chat window.
3. Translate that thesis into information architecture, primary user journeys,
   screen designs, data ownership, API contracts and clear acceptance criteria.
   Explain significant trade-offs and preserve a viable migration path.
4. Implement complete vertical slices from interaction through persistence and
   recovery. Include onboarding, capture, planning, execution, review, the
   existing life domains, integrations and settings. No decorative controls,
   mock-only features or unfinished states count as delivered functionality.
5. Verify the final experience through unit, integration, end-to-end, visual,
   accessibility and performance evidence appropriate to each claim.

## Safety and delivery gates retained

- Phase 0 remains first: prove synthetic recovery in disposable
  `pgvector/pgvector:pg16` through the existing `infra/db-move.py` CLI. Apply
  migrations, seed synthetic domains, dump, drop the synthetic source, restore
  to a fresh database and compare exact counts. Never inspect, copy, upload or
  use the production dump; no production data belongs in CI or agent storage.
- Keep the original correctness audit: bounded lists, no database awaits in
  loops, row ids and local times in AI summaries, ActivityService gates on
  timers and DST-safe calendar arithmetic. Observe regression tests failing
  before fixing each demonstrated bug class.
- Keep the architecture requirements: application database imports go through
  `@atlas/db`, pure domain logic belongs in `packages/shared`, and domain modules
  implement one consistent contract.
- Capture the existing screenshot suite before UI edits and inspect the PNGs.
  Measure all thirteen existing routes at 390px in light and dark: no horizontal
  overflow, interactive targets at least 24 by 24 pixels, text inputs at least
  16px and zero axe violations of any severity. Preserve coverage through any
  route consolidation and cover every query-backed loading, empty and error
  state.
- Replace Today's read waterfall with an aggregate read while preserving
  individual endpoints. Measure the current baseline and the final result;
  historical database latency figures are not a current benchmark.
- Run `pnpm build`, `pnpm typecheck --force`, `pnpm lint`, then `pnpm test` at
  each delivery gate. E2E needs pgvector and a running test app: rely on CI and
  claim only observed results.
- Use phase branches `codex/phase-N-<topic>` and PRs against `main`. Do not commit
  directly to `main`. Do not begin the next phase until the preceding phase's
  PR is open and its CI is green. Split an oversized phase into smaller PRs
  rather than expanding an unreviewable diff. Account for already merged work.
- Never run `prisma migrate dev`. Production deletions require printing the
  exact affected rows and stopping for the owner. Preserve
  `if (toolExecutions.length === 0) throw err;` in the AI orchestrator.
- Do not change live infrastructure, rotate credentials, add runtime
  dependencies or change deployment topology without the required authority.

## Evidence and completion

Keep an implementation and verification record linked to phase PRs and their
tested commits. An attractive design document, passing unit tests, or completed
individual screens alone do not establish end-to-end completion. Audit every
requirement above against the current repository, observed CI runs and measured
runtime behaviour before declaring the full objective achieved.

This file records the revised working objective. It does not claim that the
Codex app's saved goal field has been edited or that any phase is complete.
