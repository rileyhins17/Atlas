# Task creation preserves submitted drafts

The main task composer and dated quick-add form allowed editing during an
in-flight create request, then cleared the field when that earlier request
succeeded. Quick-add also allowed changing priority/repeat or hiding the form
while saving and had no persistent local failure state.

Both composers now make the submitted title read-only until settlement and show
Saving task. Quick-add disables priority, recurrence and dismissal while pending.
Failures retain the draft and expose a persistent alert with the Add action
available to retry. Successful requests still clear the submitted title; dated
quick-add still clears recurrence and retains the chosen priority.

Four actual-component regressions failed first. Eight focused creation/timing
tests pass. Browser verification remains outstanding.

This follows PR #57 through 87be192. No production data, credentials, migrations,
runtime dependencies or deployment changes.

The browser case holds each form submission, attempts further typing, fails it,
then retries through the real API and verifies saved ID, title and priority
after reload. It measures error states at 390px in both themes, with full and
independent selection configured. No browser or visual pass is claimed.

Local checks passed in order: build 6/6, forced typecheck 10/10, lint zero
errors with three existing warnings, and 1670 unit tests (349 web).
