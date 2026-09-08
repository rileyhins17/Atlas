# Mood check-in loading and save recovery

Two older pending tests only proved absence of the prompt. They now positively
assert a rendered skeleton for each read. Two new routine-error tests recover
into the right window and avoid asking again when an answer already exists.
They verify only the failed routine query is retried. These read-state assertions
passed against existing code.

A new failed-save regression was observed red. MoodCheckIn now retains a
persistent error and lets the user choose a mood to retry. Successful recovery
refreshes journal data before the component considers the window answered.
All 20 mood tests pass, including the existing morning/evening and shift cases.

The browser case supplies a synthetic routine whose wake window includes the
current local time, without moving the clock. Journal history is isolated until
a failed POST is retried through the real API; the returned row becomes the
query result. It measures failure/recovery at 390px in both themes, reloads and
verifies the real saved journal ID, mood and body after removing the history
fixture. No existing rows are deleted or overwritten. The full and independent
selections are configured but unverified while Actions is billing-blocked.

On Today, DayOverview gates routine-read errors before rendering MoodCheckIn;
child routine recovery tests do not claim that error renders in the full page.
This follows unmerged PR #63 through 0432c2b. No production data, credentials,
migrations, runtime dependencies or deployment changes.

Ordered local gates passed: build 6/6, forced typecheck 10/10, lint zero errors
with three existing warnings, and 1710 unit tests including 389 web tests.
