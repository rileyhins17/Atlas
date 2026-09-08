# A failed brief keeps context and a retry

Daily-brief generation had no persistent component-level failure state. The
initial Brief me and existing-brief Refresh actions now show a failure message
while leaving the confirmed empty state or existing brief readable. The same
action retries; pending generation disables it and clears the old failure.

Two actual-component regressions failed first. Nine HeroBrief cases now pass,
including configured-success empty coverage that passed before the change.
The browser case supplies synthetic status/insight/provider responses and tests
both first and existing brief failures, retry and refreshed rendering at 390px
in both themes. Full and independent selection are configured. This does not
prove provider execution, invite authorization, billing or database persistence.
Browser measurements remain unverified while Actions is billing-blocked.

This follows unmerged PR #59 through 75fb1c3. No production data, credentials,
migrations, runtime dependencies or deployment changes.

Local gates passed in order: build 6/6, forced typecheck 10/10, lint zero
errors with three existing warnings, and 1677 unit tests including 356 web.
The browser case creates its own synthetic task so independent execution reaches
the brief instead of the first-run welcome. No new browser measurement is claimed.
