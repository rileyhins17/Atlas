# Core panel query-state evidence

Seventeen actual-component tests exercise Calendar, Money, Routine and Writing
through their real query hooks with API methods mocked. Each of the six read
sources is checked pending and failed with Retry. Four panel-level empty cases
verify confirmed absence, and Writing retains a saved note when journal history
fails. Money disables transaction creation while accounts are unavailable.

All seventeen passed against the existing implementation. These are coverage
additions, not claimed observed-red regressions or reasons to rewrite working UI.
The loading assertions positively identify rendered skeletons and also exclude
false empty claims. They do not establish screen-reader announcements or geometry.
GoogleCalendarCard and PlaidCard are mocked out: their child states remain
separate ledger entries. Content/editor states also retain their separate tests.

The browser case simulates failed and confirmed-empty API reads on all four
surfaces, retries the relevant read and measures each state at 390px in both
themes. Full and independent selection are configured. Empty fixtures do not
prove database contents or provider integrations; browser execution remains
unverified while Actions is billing-blocked.

This follows unmerged PR #60 through f410ff7. No application behavior, production
data, credentials, migrations, runtime dependencies or deployment changes.

The initial typecheck caught TS2769 from an unsupported Testing Library exact
option; an anchored name regex fixes the selector. Final ordered gates passed:
build 6/6, forced typecheck 10/10, lint zero errors with three existing warnings,
and 1694 unit tests including 373 web. Browser error fixtures explicitly supply
API messages, matching the client's ApiError passthrough rather than assuming
that an HTTP failure uses the generic non-API fallback.
