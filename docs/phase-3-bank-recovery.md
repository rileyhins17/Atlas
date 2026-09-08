# Bank actions preserve a clear recovery path

A failed bank disconnection previously depended on a transient notification.
The panel now keeps a persistent error and the linked bank visible so the same
item can be retried. Starting connect, sync or disconnect clears earlier action
errors and sync results; an old import count cannot appear to describe a failed
new sync. Unavailable connections explain the manual account/transaction path
without asking users to interpret server credential configuration.

Three actual-component regressions failed first. Five cases pass: status pending,
failed-read Retry into confirmed disconnected state, unavailable configuration,
failed disconnect/retry, and sync success followed by failure and recovery.
The Plaid SDK and API calls are mocked in unit tests.

The browser case intercepts all bank status/sync/disconnect requests. It measures
sync failure, retained failed disconnection and recovered actions at 390px in
both themes, and verifies both disconnect attempts carry the same synthetic ID.
Full and independent selection are configured. No bank data is deleted, no
provider action is executed, and these tests do not prove provider integration
or database removal. Browser measurements remain unverified while Actions is
billing-blocked.

This follows unmerged PR #61 through ab833ad. No production data, credentials,
migrations, runtime dependencies or deployment changes.

Initial typecheck caught missing connector/pushed fields in the synthetic sync
result (TS2345); both fixtures now include them and the unit result is typed.
Final ordered gates passed: build 6/6, forced typecheck 10/10, lint zero errors
with three existing warnings, and 1699 unit tests including 378 web tests.
