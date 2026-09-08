# Writing survives slow and failed saves

The journal/note composer allowed changing body, title, mood and note mode during
a pending save. The earlier successful response then cleared all those fields,
including writing entered after submission.

Pending saves now protect the body and note title with read-only fields, disable
mood/mode changes and expose a saving status. A failed save keeps all draft values
and presents a persistent alert. The same Save action retries. Starting another
submission clears obsolete creation errors inside the submit latch. Errors from
editing/deleting existing writing are shown outside the new-entry form.

Four actual-component regressions failed first and pass after the fix. Both
journal and note cases verify pending protection, retained values, repeated-submit
suppression and the exact retry payload. The browser case holds each request,
attempts further typing, fails it, measures the error state at 390px in both
themes, retries through the real API, reloads and verifies the saved card and API
ID/body/mood or title/pinned status. Full and independent selection are configured.
Browser and visual results remain unverified while Actions is billing-blocked.

This follows unmerged PR #58 through cb17fc9. No production data, credentials,
migrations, runtime dependencies or deployment changes.

The initial forced typecheck caught an incorrectly inferred deferred test mock
(TS2345); the pending mock now explicitly returns Promise<never>. The final
ordered gates passed: build 6/6, forced typecheck 10/10, lint zero errors with
three existing warnings, and 1674 unit tests including 353 web tests. Four new
error-state PNG captures are configured but have not been generated or viewed.
