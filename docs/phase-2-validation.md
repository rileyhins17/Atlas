# Phase 2 architecture gate

This is the consolidated completion candidate for the architecture phase. CI
must be observed green on its PR before Phase 3 starts. The product redesign
remains required by [REFACTOR-GOAL.md](./REFACTOR-GOAL.md).

## Boundaries and responsibilities

- `@atlas/db` owns the generated Prisma client. The root ESLint rule rejects
  direct `@prisma/client` imports and generated subpaths in both apps and the
  AI, connector and shared packages.
- `packages/shared` owns domain contracts, validation schemas, calculations,
  grouping, response serialization, summaries, calendar layout and draft
  policies, exercise matching, tool definitions, pricing and context budgeting.
  Its production source cannot import Prisma, the DB/AI/connector packages,
  Nest, Next, React, or application source. Nine prohibited-import probes were
  observed failing lint; the allowed zod probe passed.
- Nest services retain owner checks, database queries, transactions, timers,
  transport errors and coordination of side effects. Connectors retain HTTP,
  provider authentication and cancellation. Browser components retain React
  state/effects, DOM geometry, event handling and rendering. Clock and timezone
  acquisition stays at the runtime edge; domain calculations accept values.
  Constructing a query or composing a response from an awaited result does not
  create a second implementation of the shared domain policy.
- All ten life domains extend `RegisteredDomainModule`, which implements the
  shared `DomainModule` contract. Registration, owner-context dispatch and token
  estimation have one implementation. Each adapter declares metadata and calls
  its shared tool factory. Finance still has no write tools.

## Consolidated source review

PRs #13–#28 moved the existing domain calculations and their tests into shared
code, retaining compatibility exports where callers already use them. This
completion pass covers the remaining tool catalogs, Google calendar selection
and event mapping, timeline page serialization, workout proposal matching and
superset pairing, AI event patch intervals, composer overlap and week layout.

The review covered API modules/core, web libraries/components, AI and connector
source. Remaining named helpers are runtime adapters (database pagination,
network concurrency, OAuth signing/verification, HTTP endpoint construction,
vector SQL encoding, clock acquisition), thin shared-function wrappers, or
React rendering and interaction. Database ownership and query bounds remain
service responsibilities; shared code has no database client dependency.

The duplicate Google event mapping in the single-event path now calls the same
shared mapping as the batch path. Reversed/missing intervals still skip, primary
calendar identity remains null, and unchanged remote rows still avoid a write.
The calendar scroll effect and its dependencies are unchanged: clock ticks must
not yank the user's scroll position back to the current hour.

## Behavior evidence

Before this pass, all 61 tests in the five targeted API suites passed: domain
adapters, Google multi-calendar, timeline reads, template supersets and tool
routing. An executable comparison of every original tool factory against its
shared replacement passed for all ten domains, including full nested schemas
and fresh-array allocation. All 31 database call expressions in the three
changed calendar, timeline and workout-template services match the baseline.
The week grid rendered JSX also matches its baseline. Six additional shared
tests cover calendar choice,
invalid remote intervals/no-op comparisons, aligned superset deduplication,
local exercise proposals, event duration precedence and private-field exclusion
from timeline pagination.

The preceding correctness follow-up, PR #29 at `040d6b9`, is green in CI run
34186858208. Its best-session-volume regression was observed failing before its
fix (expected 200000, received 300000). That behavior correction is separate
from this behavior-preserving architecture pass.

Full local gate results and the tested CI revision are recorded in this PR's
body. Local Playwright is skipped because there is no disposable pgvector test
origin; only observed CI results count. Phase 3 begins with the existing
screenshot command against synthetic CI data, followed by inspection of the
PNGs before visual changes.
