# Habit creation and editing preserve drafts

Creation and editing left fields mutable while saving. A successful response
could discard newer typing; a failed edit had no persistent error in the dialog.
Four new regression tests were observed failing before the fix.

Pending drafts are now read-only, cadence and cancel are disabled, and the edit
dialog cannot close until the request settles. Both forms announce saving and
retain an inline failure with the draft for retry. Creation keeps the existing
duplicate-name confirmation. Dialog dismissal remains enabled by default for
other consumers; the pending habit editor explicitly opts out.

Eight focused tests passed, including duplicate-name behavior. Browser coverage
is configured at 390px in both themes: hold then fail POST/PATCH, attempt typing
and dismissal, measure error/recovery, retry through the real API, reload and
assert the saved synthetic habit ID, name, target and cadence. It runs in the
full and independent selections. It has not been observed executing while
Actions billing blocks jobs, so fresh geometry/accessibility and persistence
verification remain pending.

This follows unmerged PR #65 at a31fde8. No runtime dependencies, migrations,
production data, credentials or live infrastructure changes.

Ordered local gates passed: build 6/6, forced typecheck 10/10, lint zero errors
with three existing warnings, and 1,721 unit tests (393 web).
